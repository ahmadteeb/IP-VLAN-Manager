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
                "CREATE TABLE ips (id INTEGER PRIMARY KEY, gateway TEXT)",
                "CREATE TABLE vlans (id INTEGER PRIMARY KEY, vlan_id INTEGER, vendor_id INTEGER)",
                "CREATE TABLE sites (id INTEGER PRIMARY KEY, site_id TEXT, vendor_id INTEGER, service_ip_id INTEGER, om_ip_id INTEGER, service_vlan_id INTEGER, om_vlan_id INTEGER, interface_id INTEGER)",
                "INSERT INTO routers VALUES (1, 'old-name', '10.61.1.1', 'old-type', NULL), (2, 'manual', '192.168.1.1', 'manual', NULL)",
                "INSERT INTO ips VALUES (1, '10.0.0.1')",
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

    def test_router_refresh_is_idempotent_and_preserves_missing(self):
        self.assertEqual(update_routers(self.engine, self.directory.name), (1, 1))
        self.assertEqual(update_routers(self.engine, self.directory.name), (1, 0))
        self.assertEqual(len(self.rows("routers")), 2)
        self.assertEqual(self.rows("routers")[0]["name"], "new-name")
        self.assertEqual(self.rows("routers")[0]["router_type"], "new-type")

    def test_new_router_and_interface_insert(self):
        self.elements[0]["ip-address"] = "10.61.1.2"
        self.write_reports()
        self.assertEqual(update_routers(self.engine, self.directory.name), (1, 1))
        self.assertEqual(len(self.rows("routers")), 3)
        self.assertEqual(self.rows("routers")[2]["name"], "new-name")

    def test_sites_null_om_vendor_vlan_and_missing_service(self):
        update_routers(self.engine, self.directory.name)
        self.assertEqual(update_sites(self.engine, self.directory.name), (1, 1))
        site = self.rows("sites")[0]
        self.assertEqual(site["service_vlan_id"], 1)
        self.assertIsNone(site["om_vlan_id"])
        self.assertIsNotNone(site["interface_id"])

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

    def test_missing_om_preserves_existing_site_assignments(self):
        update_routers(self.engine, self.directory.name)
        with self.engine.begin() as conn:
            conn.execute(text("UPDATE sites SET om_ip_id=99, service_vlan_id=2 WHERE id=1"))
        self.assertEqual(update_sites(self.engine, self.directory.name), (0, 2))
        self.assertEqual(self.rows("sites")[0]["service_vlan_id"], 2)

    def test_database_failure_rolls_back_router_changes(self):
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TRIGGER reject_interface BEFORE INSERT ON interfaces BEGIN SELECT RAISE(ABORT, 'test failure'); END"))
        with self.assertRaises(Exception):
            update_routers(self.engine, self.directory.name)
        self.assertEqual(self.rows("routers")[0]["name"], "old-name")


if __name__ == "__main__":
    unittest.main()
