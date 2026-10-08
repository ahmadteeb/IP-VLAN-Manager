import json
from pathlib import Path
import tempfile
import unittest

from sqlalchemy import create_engine, text

from check_duplicated_ips import check_duplicated_ips, find_duplicates
from service_utils import inventory_ipv4
from duplicate_ip_migration import remove_legacy_duplicate_ip_table


class DuplicateIPTest(unittest.TestCase):
    def test_legacy_cache_migration_and_new_schema_preservation(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        remove_legacy_duplicate_ip_table(engine)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE duplicate_IPs (ip TEXT, router_id INTEGER, interface TEXT, checked_at DATETIME)'))
            conn.execute(text('CREATE TABLE ips (id INTEGER PRIMARY KEY)'))
            conn.execute(text('INSERT INTO ips VALUES (3)'))
        remove_legacy_duplicate_ip_table(engine)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE duplicate_IPs (ip_id INTEGER, router_id INTEGER, interface_id INTEGER, checked_at DATETIME)'))
            conn.execute(text('INSERT INTO duplicate_IPs (ip_id, router_id, interface_id) VALUES (3, 7, 11)'))
        remove_legacy_duplicate_ip_table(engine)
        with engine.connect() as conn:
            self.assertEqual(conn.execute(text('SELECT ip_id FROM duplicate_IPs')).scalar_one(), 3)
            self.assertEqual(conn.execute(text('SELECT id FROM ips')).scalar_one(), 3)

    def test_unassigned_address_markers(self):
        for value in (None, '', '  ', '--', ' -- ', 'NoIP', ' noip ', 'NOIP', '0.0.0.0'):
            with self.subTest(value=value):
                self.assertIsNone(inventory_ipv4(value))
        self.assertEqual(inventory_ipv4(' 10.0.0.1 '), '10.0.0.1')
        with self.assertRaises(ValueError):
            inventory_ipv4('10.0.0.999')

    def test_distinct_interfaces_only_and_numeric_order(self):
        elements = [{'res-id': 'a', 'name': 'Router A', 'ip-address': '10.61.1.1'}]
        def link(ip, name):
            return {'ne-id': 'a', 'addrv4': ip, 'name': name}
        links = [link('10.0.0.10', 'p1'), link('10.0.0.10', 'p2'),
                 link('10.0.0.2', 'p1'), link('10.0.0.2', 'p2'),
                 link('10.0.0.3', 'p1'), link('10.0.0.3', 'p1'),
                 link(None, 'p3'), link('0.0.0.0', 'p3'), {'name': 'unnumbered'},
                 link('--', 'p4'), link('  --  ', 'p5'), link('   ', 'p6'),
                 link(' 10.0.0.2 ', 'p1')]
        routers = [{'id': 7, 'router_ip': '10.61.1.1'}]
        ips = [{'id': index, 'gateway': ip, 'type': '4G'} for index, ip in enumerate(('10.0.0.2', '10.0.0.3', '10.0.0.10'), 1)]
        interfaces = [{'id': index, 'router_id': 7, 'name': name} for index, name in enumerate(('p1', 'p2'), 1)]
        results = find_duplicates(elements, links, routers, ips, interfaces)
        self.assertEqual([row['ip_id'] for row in results], [1, 3])
        self.assertEqual(len(results[0]['occurrences']), 2)
        with self.assertRaises(ValueError):
            find_duplicates(elements, [link('invalid', 'p1')], routers, ips, interfaces)

    def test_database_technology_and_router_id_storage(self):
        elements = [{'res-id': 'a', 'name': 'Router A', 'ip-address': '10.61.1.1'},
                    {'res-id': 'b', 'name': 'Router B', 'ip-address': '10.61.1.2'}]
        routers = [{'id': 7, 'router_ip': '10.61.1.1'}, {'id': 9, 'router_ip': '10.61.1.2'}]
        links = [{'ne-id': ne, 'addrv4': ip, 'name': 'p1'}
                 for ip in ('10.0.0.1', '10.0.0.2', '10.0.0.3') for ne in ('a', 'b')]
        ips = [{'id': 3, 'gateway': '10.0.0.1', 'type': '4G'}, {'id': 4, 'gateway': '10.0.0.3', 'type': ''}]
        interfaces = [{'id': 11, 'router_id': 7, 'name': 'p1'}, {'id': 12, 'router_id': 9, 'name': 'p1'}]
        results = find_duplicates(elements, links, routers, ips, interfaces)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['ip_id'], 3)
        self.assertEqual(results[0]['occurrences'], [{'router_id': 7, 'interface_id': 11}, {'router_id': 9, 'interface_id': 12}])
        ips[0]['type'] = '3G'
        self.assertEqual(find_duplicates(elements, links, routers, ips, interfaces), results)
        self.assertEqual(find_duplicates(elements, links, routers, [], interfaces), [])
        self.assertEqual(find_duplicates(elements, links, routers, ips, interfaces[:1]), [])
        # Inventory aliases/subinterfaces resolving to the same ID are counted once.
        links.append({'ne-id': 'a', 'addrv4': '10.0.0.1', 'name': 'p1.100'})
        self.assertEqual(find_duplicates(elements, links, routers, ips, interfaces), results)
        routers.append({'id': 10, 'router_ip': '10.61.1.1'})
        self.assertEqual(find_duplicates(elements, links, routers, ips, interfaces), [])

    def test_snapshot_refresh_and_failed_scan_preserves_previous(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE duplicate_IPs (id INTEGER PRIMARY KEY, ip_id INTEGER REFERENCES ips(id), router_id INTEGER REFERENCES routers(id), interface_id INTEGER REFERENCES interfaces(id), checked_at DATETIME, UNIQUE(ip_id, router_id, interface_id))'))
            conn.execute(text('CREATE TABLE routers (id INTEGER PRIMARY KEY, router_ip TEXT)'))
            conn.execute(text("INSERT INTO routers VALUES (7, '10.61.1.1')"))
            conn.execute(text('CREATE TABLE ips (id INTEGER PRIMARY KEY, gateway TEXT UNIQUE, type TEXT)'))
            conn.execute(text("INSERT INTO ips VALUES (3, '10.0.0.1', '4G')"))
            conn.execute(text('CREATE TABLE interfaces (id INTEGER PRIMARY KEY, router_id INTEGER, name TEXT)'))
            conn.execute(text("INSERT INTO interfaces VALUES (11, 7, 'p1'), (12, 7, 'p2')"))
            conn.execute(text('PRAGMA foreign_keys=ON'))
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'network-element.json').write_text(json.dumps([{'res-id': 'a', 'name': 'Router', 'ip-address': '10.61.1.1'}]))
            report = Path(directory, 'ltp-v2.json')
            links = [{'ne-id': 'a', 'addrv4': '10.0.0.1', 'name': name} for name in ('p1', 'p2')]
            links.append({'name': 'unnumbered'})
            links.append({'addrv4': ' -- ', 'name': 'placeholder'})
            links.append({'addrv4': 'NoIP', 'name': 'no-address'})
            report.write_text(json.dumps(links))
            self.assertEqual(check_duplicated_ips(engine, directory), 1)
            with engine.connect() as conn:
                saved = list(conn.execute(text('SELECT * FROM duplicate_IPs ORDER BY interface_id')).mappings())
                self.assertEqual(len(saved), 2)
                self.assertEqual(saved[0]['ip_id'], 3)
                self.assertEqual(saved[0]['router_id'], 7)
                self.assertEqual([row['interface_id'] for row in saved], [11, 12])
                self.assertIsNotNone(saved[0]['checked_at'])
            self.assertEqual(check_duplicated_ips(engine, directory), 1)
            report.write_text(json.dumps([{'addrv4': '10.0.0.1', 'name': 'missing-ne'}]))
            with self.assertRaisesRegex(ValueError, 'missing ne-id'):
                check_duplicated_ips(engine, directory)
            report.write_text('[]')
            with self.assertRaises(ValueError):
                check_duplicated_ips(engine, directory)
            with engine.connect() as conn:
                self.assertEqual(conn.execute(text('SELECT COUNT(*) FROM duplicate_IPs')).scalar_one(), 2)
            report.write_text(json.dumps(links))
            with engine.begin() as conn:
                conn.execute(text("CREATE TRIGGER reject_duplicate BEFORE INSERT ON duplicate_IPs BEGIN SELECT RAISE(ABORT, 'test failure'); END"))
            with self.assertRaises(Exception):
                check_duplicated_ips(engine, directory)
            with engine.begin() as conn:
                self.assertEqual(conn.execute(text('SELECT COUNT(*) FROM duplicate_IPs')).scalar_one(), 2)
                conn.execute(text('DROP TRIGGER reject_duplicate'))
            report.write_text(json.dumps(links[:1]))
            self.assertEqual(check_duplicated_ips(engine, directory), 0)
            with engine.connect() as conn:
                self.assertEqual(conn.execute(text('SELECT COUNT(*) FROM duplicate_IPs')).scalar_one(), 0)


if __name__ == '__main__':
    unittest.main()
