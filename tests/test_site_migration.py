import unittest

from sqlalchemy import create_engine, inspect, text

from migrations.site_migration import remove_legacy_site_columns


class SiteMigrationTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        self.addCleanup(self.engine.dispose)

    def test_removes_only_legacy_columns_and_can_repeat(self):
        with self.engine.begin() as conn:
            conn.execute(text('CREATE TABLE sites (id INTEGER PRIMARY KEY, '
                              'technologies JSON, vendor TEXT, technology_type TEXT, vendor_id INTEGER)'))
            conn.execute(text("INSERT INTO sites VALUES (1, '[\"LTE\"]', 'Acme', 'LTE', 7)"))
        remove_legacy_site_columns(self.engine)
        remove_legacy_site_columns(self.engine)
        self.assertEqual({column['name'] for column in inspect(self.engine).get_columns('sites')},
                         {'id', 'technology_type', 'vendor_id'})
        with self.engine.connect() as conn:
            self.assertEqual(tuple(conn.execute(text('SELECT * FROM sites')).one()), (1, 'LTE', 7))

    def test_refuses_to_drop_without_replacements(self):
        with self.engine.begin() as conn:
            conn.execute(text('CREATE TABLE sites (id INTEGER, technologies JSON, vendor TEXT)'))
        with self.assertRaises(ValueError):
            remove_legacy_site_columns(self.engine)
        self.assertEqual(len(inspect(self.engine).get_columns('sites')), 3)

    def test_missing_table_is_safe(self):
        remove_legacy_site_columns(self.engine)


if __name__ == '__main__':
    unittest.main()
