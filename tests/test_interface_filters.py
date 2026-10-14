import ast
from pathlib import Path
import unittest

from flask import Flask, jsonify, request
from sqlalchemy.orm import joinedload
from models.models import db, Interface, Router


class InterfaceFiltersTest(unittest.TestCase):
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
        route = next(node for node in source.body
                     if isinstance(node, ast.FunctionDef) and node.name == 'api_get_interfaces')
        route.decorator_list = []
        namespace = dict(db=db, Interface=Interface, Router=Router, request=request, jsonify=jsonify, joinedload=joinedload)
        exec(compile(ast.Module(body=[route], type_ignores=[]), 'app.py', 'exec'), namespace)
        self.route = namespace['api_get_interfaces']
        routers = [Router(name=name, router_ip=f'10.0.0.{i}', router_type='Test')
                   for i, name in enumerate(['Core', 'Edge'], 1)]
        db.session.add_all(routers)
        db.session.flush()
        self.core_id = routers[0].id
        db.session.add_all([
            Interface(name='Port1', router_id=routers[0].id),
            Interface(name='Port2', router_id=routers[0].id),
            Interface(name='Port1', router_id=routers[1].id),
        ])
        db.session.commit()

    def results(self, **params):
        with self.app.test_request_context('/api/interfaces', query_string=params):
            return self.route().get_json()

    def test_search_and_router_filter(self):
        self.assertEqual(self.results()['total'], 3)
        self.assertEqual(self.results(search='port1')['total'], 2)
        self.assertEqual(self.results(search=' CORE ')['total'], 2)
        self.assertEqual(self.results(search='port1', router_id=self.core_id)['total'], 1)
        self.assertEqual(self.results(search='Edge', router_id=self.core_id)['total'], 0)
        self.assertEqual(self.results(search='%')['total'], 0)
        self.assertEqual(self.results(search='_')['total'], 0)

    def test_filter_applies_before_pagination(self):
        result = self.results(search='Core', per_page=1, page=2)
        self.assertEqual(result['total'], 2)
        self.assertEqual(result['pages'], 2)
        self.assertEqual(result['interfaces'][0]['name'], 'Port2')

    def test_interface_and_router_filters_combine(self):
        interface = Interface.query.filter_by(name='Port2', router_id=self.core_id).one()
        result = self.results(interface_id=interface.id, router_id=self.core_id)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['interfaces'][0]['id'], interface.id)
        other_router = Router.query.filter(Router.id != self.core_id).one()
        self.assertEqual(self.results(interface_id=interface.id, router_id=other_router.id)['total'], 0)

    def test_page_does_not_preload_filter_tables(self):
        source = ast.parse(Path('app.py').read_text(encoding='utf-8'))
        route = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'interfaces')
        route.decorator_list = []
        namespace = dict(render_template=lambda name: name)
        exec(compile(ast.Module(body=[route], type_ignores=[]), 'app.py', 'exec'), namespace)
        self.assertEqual(namespace['interfaces'](), 'interfaces.html')


if __name__ == '__main__':
    unittest.main()
