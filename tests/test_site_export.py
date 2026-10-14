import ast
import csv
import io
from pathlib import Path
import unittest

from flask import Flask, jsonify, request, send_file

from models.models import db, Site, Vendor


class SiteExportTest(unittest.TestCase):
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
        route = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'api_export_sites')
        self.assertTrue(any(isinstance(d, ast.Call) and isinstance(d.func, ast.Name)
                            and d.func.id == 'permission_required' and d.args[0].value == 'sites.export'
                            for d in route.decorator_list))
        route.decorator_list = []
        namespace = dict(Site=Site, request=request, jsonify=jsonify, send_file=send_file,
                         io=io, csv=csv, emit_progress=lambda *args: None, visible_sites=lambda: Site.query)
        exec(compile(ast.Module(body=[route], type_ignores=[]), 'app.py', 'exec'), namespace)
        self.app.add_url_rule('/api/export/sites', view_func=namespace['api_export_sites'], methods=['GET', 'POST'])
        db.session.add_all([
            Site(site_id='001', site_name='First', technology_type='LTE'),
            Site(site_id='001', site_name='First', technology_type='3G'),
            Site(site_id='002', site_name='Second', technology_type='LTE'),
            Site(site_id='003', site_name='Other', technology_type='5G'),
        ])
        db.session.commit()
        self.client = self.app.test_client()

    def test_bulk_export_includes_all_technologies_without_duplicate_rows(self):
        response = self.client.post('/api/export/sites', json={'site_ids': [' 001 ', '002', '001']})
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment', response.headers['Content-Disposition'])
        rows = list(csv.DictReader(io.StringIO(response.get_data(as_text=True))))
        self.assertEqual([row['Site ID'] for row in rows], ['001', '001', '002'])
        self.assertEqual({row['Technologies'] for row in rows if row['Site ID'] == '001'}, {'LTE', '3G'})

    def test_unknown_ids_do_not_silently_export_partial_results(self):
        response = self.client.post('/api/export/sites', json={'site_ids': ['001', 'missing']})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json['missing_site_ids'], ['missing'])

    def test_vendor_and_technology_filters_combine(self):
        vendor = Vendor(name='Acme')
        db.session.add(vendor)
        db.session.flush()
        Site.query.filter_by(site_id='001', technology_type='LTE').update({'vendor_id': vendor.id})
        db.session.commit()
        for filters in ({'vendor_id': str(vendor.id)}, {'technology': '3G'},
                        {'vendor_id': vendor.id, 'technology': 'LTE'}):
            response = self.client.post('/api/export/sites', json={'site_ids': ['001', '002'], **filters})
            self.assertEqual(response.status_code, 200)
            rows = list(csv.DictReader(io.StringIO(response.get_data(as_text=True))))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['Site ID'], '001')
        response = self.client.post('/api/export/sites', json={
            'site_ids': ['001'], 'vendor_id': vendor.id, 'technology': '5G'})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('missing_site_ids', response.json)

    def test_invalid_filters_are_rejected(self):
        for filters in ({'vendor_id': []}, {'vendor_id': 'bad'}, {'vendor_id': True},
                        {'technology': ['LTE']}):
            response = self.client.post('/api/export/sites', json={'site_ids': ['001'], **filters})
            self.assertEqual(response.status_code, 400)

    def test_multiple_technologies_and_empty_selection(self):
        for selected, expected in [(['LTE', '3G'], 3), (['3G', '5G'], 2), ([], 4)]:
            response = self.client.post('/api/export/sites', json={
                'site_ids': ['001', '002', '003'], 'technologies': selected})
            self.assertEqual(response.status_code, 200)
            rows = list(csv.DictReader(io.StringIO(response.get_data(as_text=True))))
            self.assertEqual(len(rows), expected)
        for invalid in ('LTE', [1], [''], ['x' * 101]):
            response = self.client.post('/api/export/sites', json={'site_ids': ['001'], 'technologies': invalid})
            self.assertEqual(response.status_code, 400)

    def test_invalid_payloads_never_export_everything(self):
        for payload in ({}, [], {'site_ids': []}, {'site_ids': '001'}, {'site_ids': [1]},
                        {'site_ids': [' ']}, {'site_ids': ['x' * 101]}, {'site_ids': ['001'] * 1001}):
            with self.subTest(payload_type=type(payload).__name__):
                self.assertEqual(self.client.post('/api/export/sites', json=payload).status_code, 400)
        self.assertEqual(self.client.post('/api/export/sites', data='{', content_type='application/json').status_code, 400)

    def test_existing_get_export_still_exports_all_sites(self):
        response = self.client.get('/api/export/sites')
        rows = list(csv.DictReader(io.StringIO(response.get_data(as_text=True))))
        self.assertEqual(len(rows), 4)


if __name__ == '__main__':
    unittest.main()
