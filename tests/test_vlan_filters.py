import ast
from pathlib import Path
import unittest

from flask import Flask, jsonify, request

from models.models import db, VLAN, Vendor, Site, Technology, StatusType


class VLANFiltersTest(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
        db.init_app(self.app)
        context = self.app.app_context()
        context.push()
        self.addCleanup(context.pop)
        self.addCleanup(db.session.remove)
        db.create_all()
        source = ast.parse(Path('app.py').read_text(encoding='utf-8'))
        route = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'api_get_vlans')
        route.decorator_list = []
        namespace = dict(db=db, VLAN=VLAN, Vendor=Vendor, Site=Site, StatusType=StatusType,
                         request=request, jsonify=jsonify, parse_technology=lambda value: value)
        exec(compile(ast.Module(body=[route], type_ignores=[]), 'app.py', 'exec'), namespace)
        self.route = namespace['api_get_vlans']
        vendor = Vendor(name='Acme')
        db.session.add(vendor)
        db.session.flush()
        self.vendor_id = vendor.id
        db.session.add_all([
            VLAN(vlan_id=100, type='LTE', vendor_id=vendor.id, pair_id='pair', pair_type='service'),
            VLAN(vlan_id=200, type='LTE_OM', vendor_id=vendor.id, pair_id='pair', pair_type='om', status=StatusType.ASSIGNED),
            VLAN(vlan_id=300, type='3G', vendor='Legacy'),
        ])
        db.session.commit()

    def results(self, params):
        with self.app.test_request_context('/api/vlans', query_string=params):
            return self.route().get_json()

    def test_om_search_and_status_keep_service_row(self):
        for params in ({'search': '200'}, {'status': 'ASSIGNED'},
                       {'search': '200', 'technology': 'LTE', 'vendor': self.vendor_id}):
            result = self.results(params)
            self.assertEqual(result['total'], 1)
            self.assertEqual(result['vlans'][0]['vlan_id'], 100)
            self.assertEqual(result['vlans'][0]['pair_vlan_number'], 200)

    def test_vendor_technology_and_literal_search(self):
        self.assertEqual(self.results({'search': 'Acme'})['total'], 1)
        self.assertEqual(self.results({'search': 'LTE'})['total'], 1)
        self.assertEqual(self.results({'search': '%'})['total'], 0)
        self.assertEqual(self.results({'technology': '3G', 'vendor': self.vendor_id})['total'], 0)
        self.assertEqual(self.results({})['total'], 2)


if __name__ == '__main__':
    unittest.main()
