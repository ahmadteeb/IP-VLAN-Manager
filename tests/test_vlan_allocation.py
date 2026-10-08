import unittest
import ast
import json
from pathlib import Path

from flask import Flask
from sqlalchemy import create_engine, text

from models.models import db, Vendor, Router, Interface, VLAN, Site, Role, Permission, User
from vlan_allocation import migrate_vendor_vlan_scope, used_vlan_ids


class VLANAllocationTest(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
        db.init_app(app)
        self.context = app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        self.addCleanup(db.session.remove)
        db.create_all()
        self.vendor = Vendor(name='Test')
        routers = [Router(name=f'R{i}', router_ip=f'10.61.1.{i}', router_type='test') for i in (1, 2)]
        db.session.add_all([self.vendor, *routers])
        db.session.flush()
        self.interfaces = [Interface(name='p1', router_id=routers[0].id), Interface(name='p2', router_id=routers[0].id), Interface(name='p1', router_id=routers[1].id)]
        self.vlans = [VLAN(vlan_id=number, type='4G', vendor_id=self.vendor.id) for number in (100, 100, 200, 300)]
        db.session.add_all([*self.interfaces, *self.vlans])
        db.session.flush()
        self.site = Site(site_id='existing', site_name='Existing', vendor_id=self.vendor.id,
                         interface_id=self.interfaces[0].id, service_vlan_id=self.vlans[0].id)
        db.session.add(self.site)
        db.session.commit()

    def test_default_interface_scope_and_router_scope(self):
        self.assertEqual(self.vendor.to_dict()['vlan_scope'], 'interface')
        self.assertEqual(set(used_vlan_ids(self.interfaces[0].id, self.vendor)), {self.vlans[0].id, self.vlans[1].id})
        self.assertEqual(used_vlan_ids(self.interfaces[1].id, self.vendor), [])
        self.vendor.vlan_scope = 'router'
        self.assertEqual(set(used_vlan_ids(self.interfaces[1].id, self.vendor)), {self.vlans[0].id, self.vlans[1].id})
        self.assertEqual(used_vlan_ids(self.interfaces[2].id, self.vendor), [])
        self.assertEqual(used_vlan_ids(self.interfaces[1].id, self.vendor, [self.site.id]), [])

    def test_pending_import_allocations_follow_scope(self):
        pending = {self.interfaces[0].id: {self.vlans[2].id}}
        self.assertEqual(used_vlan_ids(self.interfaces[1].id, self.vendor, pending=pending), [])
        self.vendor.vlan_scope = 'router'
        self.assertIn(self.vlans[2].id, used_vlan_ids(self.interfaces[1].id, self.vendor, pending=pending))
        self.assertNotIn(self.vlans[2].id, used_vlan_ids(self.interfaces[2].id, self.vendor, pending=pending))
        self.assertEqual(used_vlan_ids(None, self.vendor), [])

    def test_occupied_om_excludes_its_service_pair(self):
        self.vlans[2].pair_id = self.vlans[3].pair_id = 'pair'
        self.vlans[2].pair_type = 'service'
        self.vlans[3].pair_type = 'om'
        self.site.om_vlan_id = self.vlans[3].id
        db.session.commit()
        self.assertIn(self.vlans[2].id, used_vlan_ids(self.interfaces[0].id, self.vendor))

    def test_existing_vendor_migration_defaults_and_preserves_choices(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT)'))
            conn.execute(text("INSERT INTO vendors VALUES (1, 'Existing')"))
        migrate_vendor_vlan_scope(engine)
        with engine.begin() as conn:
            self.assertEqual(conn.execute(text('SELECT vlan_scope FROM vendors')).scalar_one(), 'interface')
            conn.execute(text("UPDATE vendors SET vlan_scope='router'"))
        migrate_vendor_vlan_scope(engine)
        with engine.connect() as conn:
            self.assertEqual(conn.execute(text('SELECT vlan_scope FROM vendors')).scalar_one(), 'router')

    def test_vendor_update_permission_is_seeded_and_kept_separate_from_add(self):
        # Run the real seed functions without importing the web server runtime.
        tree = ast.parse(Path('app.py').read_text(encoding='utf-8'))
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in ('init_permissions', 'init_default_roles')]
        namespace = {'db': db, 'Permission': Permission, 'Role': Role, 'json': json,
                     'app': self.context.app}
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'app.py', 'exec'), namespace)
        namespace['init_permissions']()
        add_permission = Permission.query.filter_by(code='vendors.add').one()
        admin = Role(name='Admin', is_system=True, permissions=[add_permission])
        creator = Role(name='Creator', permissions=[add_permission])
        db.session.add_all([admin, creator])
        db.session.commit()
        namespace['init_default_roles']()
        update_permission = Permission.query.filter_by(code='vendors.update').one()
        self.assertEqual(json.loads(update_permission.required_permissions), ['vendors.view'])
        self.assertTrue(admin.has_permission('vendors.update'))
        self.assertFalse(creator.has_permission('vendors.update'))
        duplicate_permission = Permission.query.filter_by(code='duplicated_ips.view').one()
        self.assertEqual(duplicate_permission.category, 'duplicated_ips')
        self.assertTrue(admin.has_permission('duplicated_ips.view'))
        self.assertFalse(creator.has_permission('duplicated_ips.view'))
        viewer_role = Role(name='Duplicate viewer', permissions=[duplicate_permission])
        viewer = User(username='duplicate-viewer', password_hash='unused', role_obj=viewer_role)
        db.session.add(viewer)
        db.session.commit()
        self.assertTrue(viewer.is_read_only())
        self.assertFalse(viewer.has_permission('ips.view'))
        editor = Role(name='Editor', permissions=[update_permission])
        user = User(username='editor', password_hash='unused', role_obj=editor)
        db.session.add(user)
        db.session.commit()
        self.assertFalse(user.is_read_only())
        self.assertFalse(user.has_permission('vendors.add'))
        namespace['init_default_roles']()
        self.assertEqual(len(admin.permissions), Permission.query.count())


if __name__ == '__main__':
    unittest.main()
