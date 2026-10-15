import ast
import csv
from datetime import datetime
from functools import wraps
import io
from pathlib import Path
import unittest

from flask import Flask, jsonify, request, send_file
from flask_login import LoginManager, current_user, login_required
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import abort

from migrations.role_migration import migrate_role_site_vendors
from models.models import db, Site, Vendor, Role, User, Permission, IP, VLAN, Interface, Router, StatusType
from site_access import visible_sites, visible_site_vendors, validate_site_vendor_ids


class SiteAccessTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', SECRET_KEY='test', TESTING=True)
        db.init_app(self.app)
        context = self.app.app_context()
        context.push()
        self.addCleanup(context.pop)
        self.addCleanup(db.session.remove)
        db.create_all()
        manager = LoginManager(self.app)
        manager.user_loader(lambda identifier: db.session.get(User, int(identifier)))
        self.a, self.b = Vendor(name='A'), Vendor(name='B')
        db.session.add_all([self.a, self.b])
        db.session.flush()
        permissions = [Permission(name=code, code=code, category=code.split('.')[0]) for code in
                       ['sites.view', 'sites.export', 'sites.generate_config', 'sites.release',
                        'sites.update', 'sites.transfer', 'sites.add', 'sites.import', 'roles.manage', 'vlans.view']]
        self.role = Role(name='Limited', site_vendor_ids=[self.a.id], permissions=permissions)
        self.user = User(username='limited', password_hash='unused', role_obj=self.role)
        self.router = Router(name='Router', router_ip='10.0.0.1', router_type='Test')
        db.session.add_all([self.user, self.router])
        db.session.flush()
        self.interface = Interface(name='p1', router_id=self.router.id)
        self.ip = IP(gateway='10.1.0.1', type='LTE', vendor_id=self.b.id)
        self.vlan = VLAN(vlan_id=100, type='LTE', vendor_id=self.b.id)
        db.session.add_all([self.interface, self.ip, self.vlan])
        db.session.flush()
        self.visible = Site(site_id='A1', site_name='Visible', vendor_id=self.a.id, technology_type='LTE')
        self.hidden = Site(site_id='B1', site_name='Secret', vendor_id=self.b.id, technology_type='LTE',
                           service_ip_id=self.ip.id, service_vlan_id=self.vlan.id)
        self.unassigned = Site(site_id='N1', site_name='No vendor', technology_type='LTE')
        db.session.add_all([self.visible, self.hidden, self.unassigned])
        db.session.commit()
        namespace = dict(app=self.app, db=db, Site=Site, Vendor=Vendor, Role=Role, User=User, Permission=Permission,
                         IP=IP, VLAN=VLAN, Interface=Interface, Router=Router, StatusType=StatusType,
                         visible_sites=visible_sites, visible_site_vendors=visible_site_vendors,
                         validate_site_vendor_ids=validate_site_vendor_ids,
                         request=request, jsonify=jsonify, send_file=send_file, current_user=current_user,
                         login_required=login_required, wraps=wraps, abort=abort, csv=csv, io=io,
                         datetime=datetime, IntegrityError=IntegrityError,
                         parse_technology=lambda value: value, emit_progress=lambda *args: None,
                         log_activity=lambda *args, **kwargs: None)
        names = ['permission_required', 'api_get_sites', 'api_export_sites', 'api_generate_site_configs',
                 'api_release_site', 'api_release_sites', 'api_transfer_sites_check', 'api_transfer_sites',
                 'api_edit_site', 'api_add_site', 'api_bulk_import_sites', 'api_get_vlans', 'api_add_role', 'api_update_role']
        source = ast.parse(Path('app.py').read_text(encoding='utf-8'))
        for name in names:
            route = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == name)
            route.decorator_list = [d for d in route.decorator_list
                                    if not (isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
                                            and d.func.attr == 'route')]
            exec(compile(ast.Module(body=[route], type_ignores=[]), 'app.py', 'exec'), namespace)
            if name != 'permission_required':
                suffix = '/<int:site_id>' if name in ('api_release_site', 'api_edit_site') else (
                    '/<int:role_id>' if name == 'api_update_role' else '')
                self.app.add_url_rule('/' + name + suffix, name, namespace[name], methods=['GET', 'POST', 'PUT', 'DELETE'])
        self.client = self.app.test_client()
        with self.client.session_transaction() as session:
            session['_user_id'] = str(self.user.id)
            session['_fresh'] = True

    def test_lists_and_exports_respect_scope(self):
        response = self.client.get('/api_get_sites')
        self.assertEqual(response.json['total'], 1)
        self.assertEqual(response.json['sites'][0]['site_id'], 'A1')
        response = self.client.get('/api_export_sites')
        rows = list(csv.DictReader(io.StringIO(response.get_data(as_text=True))))
        self.assertEqual([row['Site ID'] for row in rows], ['A1'])
        response = self.client.post('/api_export_sites', json={'site_ids': ['A1', 'B1']})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json['missing_site_ids'], ['B1'])
        response = self.client.post('/api_export_sites', json={'site_ids': ['A1'], 'vendor_id': self.b.id})
        self.assertEqual(response.status_code, 400)

    def test_all_none_and_multiple_vendors(self):
        for scope, count in [(None, 3), ([], 0), ([self.a.id, self.b.id], 2)]:
            self.role.site_vendor_ids = scope
            db.session.commit()
            self.assertEqual(self.client.get('/api_get_sites').json['total'], count)

    def test_hidden_sites_cannot_be_modified_or_generated(self):
        self.assertEqual(self.client.delete(f'/api_release_site/{self.hidden.id}').status_code, 404)
        for endpoint in ('api_release_sites', 'api_transfer_sites_check', 'api_transfer_sites',
                         'api_generate_site_configs'):
            response = self.client.post('/' + endpoint, json={
                'site_ids': [self.visible.id, self.hidden.id], 'interface_id': self.interface.id})
            self.assertIn(response.status_code, (400, 404), (endpoint, response.get_data(as_text=True)))
        response = self.client.put(f'/api_edit_site/{self.hidden.id}', json={'site_id': 'changed'})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(db.session.get(Site, self.hidden.id).site_id, 'B1')
        self.assertIsNotNone(db.session.get(Site, self.visible.id))
        response = self.client.post('/api_add_site', json={
            'site_id': 'B2', 'site_name': 'Other', 'technologies': ['LTE'], 'vendor_id': self.b.id})
        self.assertEqual(response.status_code, 404)

    def test_inventory_does_not_expose_hidden_site_names(self):
        with self.client:
            self.client.get('/api_get_sites')
            self.assertIsNone(self.ip.to_dict()['site_name'])
            self.assertIsNone(self.vlan.to_dict()['site_id'])
        self.assertEqual(self.client.get('/api_get_vlans?search=Secret').json['total'], 0)
        self.role.site_vendor_ids = None
        db.session.commit()
        with self.client:
            self.client.get('/api_get_sites')
            self.assertEqual(self.ip.to_dict()['site_name'], 'Secret')
            self.assertEqual(self.vlan.to_dict()['site_id'], 'B1')

    def test_import_cannot_create_sites_for_excluded_vendors(self):
        from openpyxl import Workbook
        workbook = Workbook()
        workbook.active.append(['Site ID', 'Site Name', 'Technologies (comma-separated)', 'Vendor Name'])
        workbook.active.append(['B2', 'Blocked', 'LTE', 'B'])
        content = io.BytesIO()
        workbook.save(content)
        content.seek(0)
        response = self.client.post('/api_bulk_import_sites', data={'file': (content, 'sites.xlsx')})
        self.assertEqual(response.status_code, 400, response.json)
        self.assertEqual(response.json['error_count'], 1)
        self.assertIn('Row 2:', response.json['errors'][0])
        self.assertIn('Vendor', response.json['errors'][0])
        self.assertIsNone(Site.query.filter_by(site_id='B2').first())

    def test_scope_never_grants_action_permissions(self):
        self.role.permissions = []
        db.session.commit()
        self.assertEqual(self.client.get('/api_get_sites').status_code, 403)
        self.assertEqual(self.client.get('/api_export_sites').status_code, 403)

    def test_role_api_validates_and_preserves_scope(self):
        payload = dict(name='Viewer', permission_ids=[self.role.permissions[0].id], site_vendor_ids=[self.b.id])
        response = self.client.post('/api_add_role', json=payload)
        self.assertEqual(response.status_code, 201, response.json)
        role = response.json['role']
        self.assertEqual(role['site_vendor_ids'], [self.b.id])
        del payload['site_vendor_ids']
        response = self.client.put(f'/api_update_role/{role["id"]}', json=payload)
        self.assertEqual(response.json['role']['site_vendor_ids'], [self.b.id])
        payload['site_vendor_ids'] = None
        response = self.client.put(f'/api_update_role/{role["id"]}', json=payload)
        self.assertIsNone(response.json['role']['site_vendor_ids'])
        for value in ([99999], ['1'], [True], 'all'):
            response = self.client.put(f'/api_update_role/{role["id"]}', json={**payload, 'site_vendor_ids': value})
            self.assertEqual(response.status_code, 400)
        self.assertIsNone(db.session.get(Role, role['id']).site_vendor_ids)

    def test_migration_preserves_existing_roles_and_can_repeat(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE roles (id INTEGER PRIMARY KEY, name TEXT)'))
            conn.execute(text("INSERT INTO roles VALUES (1, 'Existing')"))
        migrate_role_site_vendors(engine)
        migrate_role_site_vendors(engine)
        self.assertIn('site_vendor_ids', {column['name'] for column in inspect(engine).get_columns('roles')})
        with engine.connect() as conn:
            self.assertEqual(tuple(conn.execute(text('SELECT * FROM roles')).one()), (1, 'Existing', None))


if __name__ == '__main__':
    unittest.main()
