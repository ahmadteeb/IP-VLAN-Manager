import ast
import ipaddress
from pathlib import Path
import unittest

from flask import Flask, jsonify, request
from sqlalchemy import create_engine, inspect, text

from migrations.ip_migration import remove_legacy_ip_vendor
from models.models import db, IP, Vendor, StatusType


class IPVendorMigrationTest(unittest.TestCase):
    def test_migrates_legacy_names_and_preserves_existing_ids(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT UNIQUE)'))
            conn.execute(text("INSERT INTO vendors VALUES (7, 'Acme')"))
            conn.execute(text('CREATE TABLE ips (id INTEGER PRIMARY KEY, vendor TEXT, vendor_id INTEGER)'))
            conn.execute(text('CREATE INDEX ix_ips_vendor ON ips (vendor)'))
            conn.execute(text("INSERT INTO ips VALUES (1, 'Acme', NULL), (2, 'New', NULL), "
                              "(3, 'Old', 7), (4, NULL, NULL)"))
        remove_legacy_ip_vendor(engine)
        remove_legacy_ip_vendor(engine)
        self.assertNotIn('vendor', {c['name'] for c in inspect(engine).get_columns('ips')})
        self.assertEqual(inspect(engine).get_indexes('ips'), [])
        with engine.connect() as conn:
            rows = conn.execute(text('SELECT ips.id, vendors.name FROM ips LEFT JOIN vendors '
                                     'ON ips.vendor_id = vendors.id ORDER BY ips.id')).all()
            self.assertEqual([tuple(row) for row in rows], [(1, 'Acme'), (2, 'New'), (3, 'Acme'), (4, None)])

    def test_missing_table_is_safe(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        remove_legacy_ip_vendor(engine)

    def test_missing_replacement_refuses_removal(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE ips (id INTEGER, vendor TEXT)'))
        with self.assertRaises(ValueError):
            remove_legacy_ip_vendor(engine)
        self.assertIn('vendor', {c['name'] for c in inspect(engine).get_columns('ips')})


class IPVendorAPITest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', TESTING=True)
        db.init_app(self.app)
        context = self.app.app_context()
        context.push()
        self.addCleanup(context.pop)
        self.addCleanup(db.session.remove)
        db.create_all()
        source = ast.parse(Path('app.py').read_text(encoding='utf-8'))
        namespace = dict(app=self.app, db=db, IP=IP, Vendor=Vendor, StatusType=StatusType,
                         request=request, jsonify=jsonify, ipaddress=ipaddress,
                         parse_technology=lambda value: value, log_activity=lambda *args: None)
        for name in ('api_get_ips', 'api_get_available_ips', 'api_add_ip'):
            route = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == name)
            route.decorator_list = []
            exec(compile(ast.Module(body=[route], type_ignores=[]), 'app.py', 'exec'), namespace)
            self.app.add_url_rule('/' + name, name, namespace[name], methods=['GET', 'POST'])
        vendor = Vendor(name='Acme')
        db.session.add(vendor)
        db.session.flush()
        self.vendor_id = vendor.id
        db.session.add(IP(gateway='10.0.0.1', type='LTE', vendor_id=vendor.id))
        db.session.commit()
        self.client = self.app.test_client()

    def test_vendor_filters_and_response_use_relationship(self):
        self.assertNotIn('vendor', IP.__table__.columns)
        for value in ('Acme', self.vendor_id):
            response = self.client.get('/api_get_ips', query_string={'vendor': value})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['total'], 1)
            self.assertEqual(response.json['ips'][0]['vendor'], 'Acme')
        for params in ({'vendor': 'Acme'}, {'vendor_id': self.vendor_id}):
            response = self.client.get('/api_get_available_ips', query_string={'technology': 'LTE', **params})
            self.assertEqual(response.json['count'], 1)

    def test_add_by_vendor_id_or_name(self):
        for i, params in enumerate(({'vendor_id': self.vendor_id}, {'vendor': 'Acme'}), 2):
            response = self.client.post('/api_add_ip', json={
                'technology': 'LTE', 'gateway': f'10.0.0.{i}', 'subnet_mask': '255.255.255.0', **params})
            self.assertEqual(response.status_code, 201, response.json)
            self.assertEqual(response.json['ip']['vendor_id'], self.vendor_id)
            self.assertEqual(response.json['ip']['vendor'], 'Acme')
        response = self.client.post('/api_add_ip', json={
            'technology': 'LTE', 'gateway': '10.0.0.9', 'vendor': 'Unknown'})
        self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()
