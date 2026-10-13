import unittest

from sqlalchemy import create_engine, inspect, text

from migrations.vlan_migration import remove_legacy_vlan_status


class VLANMigrationTest(unittest.TestCase):
    def test_drops_status_and_index_preserving_rows(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE vlans (id INTEGER PRIMARY KEY, vlan_id INTEGER, status TEXT)'))
            conn.execute(text('CREATE INDEX ix_vlans_status ON vlans (status)'))
            conn.execute(text('CREATE INDEX ix_vlans_vlan_id ON vlans (vlan_id)'))
            conn.execute(text("INSERT INTO vlans VALUES (1, 100, 'FREE')"))
        remove_legacy_vlan_status(engine)
        remove_legacy_vlan_status(engine)
        self.assertEqual({c['name'] for c in inspect(engine).get_columns('vlans')}, {'id', 'vlan_id'})
        self.assertEqual([i['name'] for i in inspect(engine).get_indexes('vlans')], ['ix_vlans_vlan_id'])
        with engine.connect() as conn:
            self.assertEqual(tuple(conn.execute(text('SELECT * FROM vlans')).one()), (1, 100))

    def test_missing_table_is_safe(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        remove_legacy_vlan_status(engine)


if __name__ == '__main__':
    unittest.main()
