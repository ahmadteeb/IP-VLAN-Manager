import json
from pathlib import Path
import tempfile
import unittest

from sqlalchemy import create_engine, text

from update_routers import update_routers
from update_sites import update_sites


class UpdateTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.engine = create_engine("sqlite://")
        self.addCleanup(self.engine.dispose)
        with self.engine.begin() as conn:
            for sql in (
                "CREATE TABLE routers (id INTEGER PRIMARY KEY, name TEXT UNIQUE, router_ip TEXT, router_type TEXT, created_at TEXT)",
                "CREATE TABLE interfaces (id INTEGER PRIMARY KEY, router_id INTEGER, name TEXT, created_at TEXT, UNIQUE(router_id, name))",
                "CREATE TABLE ips (id INTEGER PRIMARY KEY, gateway TEXT, status TEXT, assigned_date TEXT)",
                "CREATE TABLE duplicate_IPs (id INTEGER PRIMARY KEY, router_id INTEGER, interface_id INTEGER)",
                "CREATE TABLE vlans (id INTEGER PRIMARY KEY, vlan_id INTEGER, vendor_id INTEGER)",
                "CREATE TABLE sites (id INTEGER PRIMARY KEY, site_id TEXT, vendor_id INTEGER, service_ip_id INTEGER, om_ip_id INTEGER, service_vlan_id INTEGER, om_vlan_id INTEGER, interface_id INTEGER)",
                "INSERT INTO routers VALUES (1, 'old-name', '10.61.1.1', 'old-type', NULL), (2, 'manual', '192.168.1.1', 'manual', NULL)",
                "INSERT INTO ips VALUES (1, '10.0.0.1', 'ASSIGNED', '2026-10-08')",
                "INSERT INTO vlans VALUES (1, 100, 1), (2, 100, 2)",
                "INSERT INTO sites VALUES (1, 'site-1', 1, 1, NULL, NULL, NULL, NULL), (2, 'site-2', 1, NULL, NULL, NULL, NULL, NULL)",
            ):
                conn.execute(text(sql))
        self.elements = [{"res-id": "ne-1", "ip-address": "10.61.1.1", "name": "new-name", "product-name": "new-type"}]
        self.links = [
            {"ne-id": "ne-1", "name": "port1", "is-physical": True, "is-sub-ltp": False, "mac": None, "addrv4": None},
            {"ne-id": "ne-1", "name": "port1.100", "native-name": None, "is-physical": False, "is-sub-ltp": True, "mac": None, "addrv4": "10.0.0.1"},
        ]
        self.write_reports()

    def write_reports(self):
        for filename, data in (("network-element.json", self.elements), ("ltp-v2.json", self.links)):
            Path(self.directory.name, filename).write_text(json.dumps(data), encoding="utf-8")

    def rows(self, table):
        with self.engine.connect() as conn:
            return list(conn.execute(text(f"SELECT * FROM {table} ORDER BY id")).mappings())

    def test_router_refresh_is_idempotent_and_removes_missing(self):
        self.assertEqual(update_routers(self.engine, self.directory.name), (1, 1))
        self.assertEqual(update_routers(self.engine, self.directory.name), (1, 0))
        self.assertEqual(len(self.rows("routers")), 1)
        self.assertEqual(self.rows("routers")[0]["name"], "new-name")
        self.assertEqual(self.rows("routers")[0]["router_type"], "new-type")

    def test_new_router_and_interface_insert(self):
        self.elements[0]["ip-address"] = "10.61.1.2"
        self.write_reports()
        self.assertEqual(update_routers(self.engine, self.directory.name), (1, 1))
        self.assertEqual(len(self.rows("routers")), 1)
        self.assertEqual(self.rows("routers")[0]["name"], "new-name")

    def test_optional_interface_fields_and_unclassified_rows(self):
        self.links[0].pop('mac')
        self.links[0].pop('is-sub-ltp')
        self.links.extend([
            {'ne-id': 'ne-1', 'name': 'logical', 'is-sub-ltp': False, 'mac': 'aa-bb-cc-dd-ee-ff'},
            {'ne-id': 'ne-1', 'name': 'unknown'},
            {'ne-id': 'ne-1', 'name': 'no-mac', 'is-physical': False, 'is-sub-ltp': False},
            {'name': 'no-ne'},
        ])
        self.write_reports()
        self.assertEqual(update_routers(self.engine, self.directory.name), (1, 2))
        self.assertEqual({row['name'] for row in self.rows('interfaces')}, {'port1', 'logical'})

    def test_invalid_interface_flag_prevents_writes(self):
        self.links[0]['is-physical'] = 'true'
        self.write_reports()
        with self.assertRaisesRegex(ValueError, 'flags must be booleans'):
            update_routers(self.engine, self.directory.name)
        self.assertEqual(self.rows('routers')[0]['name'], 'old-name')

    def test_conflicting_router_is_preserved_while_other_router_updates(self):
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO routers VALUES (3, 'new-name', '10.61.2.1', 'keep', NULL)"))
        self.elements.append({'res-id': 'ne-2', 'name': 'healthy', 'ip-address': '10.61.2.2', 'product-name': 'new-type'})
        self.write_reports()
        with self.assertLogs(level='WARNING') as logs:
            self.assertEqual(update_routers(self.engine, self.directory.name), (1, 0))
        self.assertIn('IP matches IDs [1]', '\n'.join(logs.output))
        routers = self.rows('routers')
        self.assertEqual(routers[0]['name'], 'old-name')
        self.assertEqual(routers[1]['router_ip'], '10.61.2.1')
        self.assertEqual(routers[2]['name'], 'healthy')

    def test_router_removal_preserves_sites_and_resource_assignments(self):
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO interfaces VALUES (20, 2, 'old-port', NULL)"))
            conn.execute(text('UPDATE sites SET interface_id=20 WHERE id=1'))
            conn.execute(text('UPDATE sites SET service_vlan_id=1, om_vlan_id=2 WHERE id=1'))
            conn.execute(text('INSERT INTO duplicate_IPs VALUES (1, 2, 20)'))
        previous = dict(self.rows('sites')[0])
        update_routers(self.engine, self.directory.name)
        self.assertEqual([row['id'] for row in self.rows('sites')], [1, 2])
        self.assertEqual(dict(self.rows('sites')[0]), {**previous, 'interface_id': None})
        self.assertEqual(self.rows('duplicate_IPs'), [])
        self.assertNotIn(20, [row['id'] for row in self.rows('interfaces')])
        self.assertEqual(self.rows('ips')[0]['status'], 'ASSIGNED')
        self.assertEqual(self.rows('ips')[0]['assigned_date'], '2026-10-08')

    def test_invalid_inventory_does_not_delete_existing_records(self):
        self.elements = []
        self.write_reports()
        with self.assertRaises(ValueError):
            update_routers(self.engine, self.directory.name)
        self.assertEqual(len(self.rows('routers')), 2)

    def test_router_delete_failure_rolls_back_site_detachment(self):
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO interfaces VALUES (20, 2, 'old-port', NULL)"))
            conn.execute(text('UPDATE sites SET interface_id=20 WHERE id=1'))
            conn.execute(text("CREATE TRIGGER reject_router_delete BEFORE DELETE ON routers BEGIN SELECT RAISE(ABORT, 'test failure'); END"))
        with self.assertRaises(Exception):
            update_routers(self.engine, self.directory.name)
        self.assertEqual(len(self.rows('routers')), 2)
        self.assertEqual(len(self.rows('sites')), 2)
        self.assertEqual(self.rows('ips')[0]['status'], 'ASSIGNED')
        self.assertEqual(self.rows('interfaces')[0]['id'], 20)
        self.assertEqual(self.rows('sites')[0]['interface_id'], 20)

    def test_router_removal_keeps_shared_ip_assigned(self):
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO interfaces VALUES (20, 2, 'old-port', NULL)"))
            conn.execute(text('UPDATE sites SET interface_id=20 WHERE id=1'))
            conn.execute(text('UPDATE sites SET service_ip_id=1 WHERE id=2'))
        update_routers(self.engine, self.directory.name)
        self.assertEqual(self.rows('ips')[0]['status'], 'ASSIGNED')

    def test_duplicate_database_ip_is_skipped(self):
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO routers VALUES (3, 'duplicate-ip', '10.61.1.1', 'keep', NULL)"))
        self.assertEqual(update_routers(self.engine, self.directory.name), (0, 0))
        self.assertEqual(self.rows('interfaces'), [])

    def test_sites_null_om_vendor_vlan_and_missing_service(self):
        self.links[0].pop('addrv4')
        self.links.append({'ne-id': 'ne-1', 'addrv4': '--', 'name': 'port2',
                           'is-physical': True, 'is-sub-ltp': False, 'mac': None})
        self.links[1]['addrv4'] = ' 10.0.0.1 '
        self.write_reports()
        update_routers(self.engine, self.directory.name)
        self.assertEqual(update_sites(self.engine, self.directory.name), (1, 1))
        site = self.rows("sites")[0]
        self.assertEqual(site["service_vlan_id"], 1)
        self.assertIsNone(site["om_vlan_id"])
        self.assertIsNotNone(site["interface_id"])
        self.assertEqual(site['service_ip_id'], 1)
        self.assertIsNone(site['om_ip_id'])

    def test_site_refresh_updates_all_five_assignments(self):
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO ips VALUES (2, '10.0.0.2', 'ASSIGNED', NULL)"))
            conn.execute(text('INSERT INTO vlans VALUES (3, 200, 1)'))
            conn.execute(text('UPDATE sites SET om_ip_id=2, service_vlan_id=2 WHERE id=1'))
        self.links.append({'ne-id': 'ne-1', 'name': 'port1.200', 'is-physical': False,
                           'is-sub-ltp': True, 'mac': None, 'addrv4': '10.0.0.2'})
        self.write_reports()
        update_routers(self.engine, self.directory.name)
        self.assertEqual(update_sites(self.engine, self.directory.name), (1, 1))
        site = self.rows('sites')[0]
        self.assertEqual((site['service_ip_id'], site['om_ip_id'], site['service_vlan_id'], site['om_vlan_id']), (1, 2, 1, 3))
        self.assertIsNotNone(site['interface_id'])

    def test_ambiguous_service_and_vlan_preserve_site(self):
        update_routers(self.engine, self.directory.name)
        self.links.append(dict(self.links[1]))
        self.write_reports()
        self.assertEqual(update_sites(self.engine, self.directory.name), (0, 2))
        self.links.pop()
        self.write_reports()
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO vlans VALUES (3, 100, 1)"))
        self.assertEqual(update_sites(self.engine, self.directory.name), (0, 2))
        self.assertIsNone(self.rows("sites")[0]["interface_id"])

    def test_invalid_report_prevents_writes(self):
        self.links[0].pop("name")
        self.write_reports()
        with self.assertRaises(ValueError):
            update_routers(self.engine, self.directory.name)
        self.assertEqual(self.rows("routers")[0]["name"], "old-name")

    def test_missing_optional_om_does_not_block_service_update(self):
        update_routers(self.engine, self.directory.name)
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO ips VALUES (2, '10.0.0.2', 'ASSIGNED', NULL)"))
            conn.execute(text("UPDATE sites SET om_ip_id=2, om_vlan_id=2, service_vlan_id=2 WHERE id=1"))
        self.assertEqual(update_sites(self.engine, self.directory.name), (1, 1))
        site = self.rows('sites')[0]
        self.assertEqual(site['service_vlan_id'], 1)
        self.assertEqual((site['om_ip_id'], site['om_vlan_id']), (2, 2))

    def test_optional_vlan_missing_from_database(self):
        update_routers(self.engine, self.directory.name)
        with self.engine.begin() as conn:
            conn.execute(text('DELETE FROM vlans'))
        self.assertEqual(update_sites(self.engine, self.directory.name), (1, 1))
        site = self.rows('sites')[0]
        self.assertIsNone(site['service_vlan_id'])
        self.assertIsNotNone(site['interface_id'])

    def test_database_failure_rolls_back_router_changes(self):
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TRIGGER reject_interface BEFORE INSERT ON interfaces BEGIN SELECT RAISE(ABORT, 'test failure'); END"))
        with self.assertRaises(Exception):
            update_routers(self.engine, self.directory.name)
        self.assertEqual(self.rows("routers")[0]["name"], "old-name")


if __name__ == "__main__":
    unittest.main()
