import ast
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

from flask import Flask, redirect, session, url_for
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from werkzeug.wrappers import Response
from werkzeug.test import Client


class BasePathTest(unittest.TestCase):
    def make_app(self, base_path):
        with patch.dict(os.environ, {'BASE_PATH': base_path}):
            config = runpy.run_path('config.py')['Config']
        app = Flask(__name__, static_folder=str(Path('static').resolve()))
        app.config.from_object(config)
        source = ast.parse(Path('app.py').read_text(encoding='utf-8'))
        mount = next(node for node in source.body
                     if isinstance(node, ast.If) and ast.unparse(node.test) == "Config.BASE_PATH != '/'")
        exec(compile(ast.Module(body=[mount], type_ignores=[]), 'app.py', 'exec'),
             dict(app=app, Config=config, DispatcherMiddleware=DispatcherMiddleware, Response=Response))

        @app.route('/login')
        def login():
            session['test'] = True
            return {'api': url_for('api'), 'static': url_for('static', filename='css/style.css')}

        @app.route('/api/interfaces')
        def api():
            return {'ok': True}

        @app.route('/')
        def index():
            return redirect(url_for('login'))

        return app

    def test_root_and_prefixed_mounts(self):
        for value, prefix in [('', ''), ('/', ''), ('/ip-manager', '/ip-manager'),
                              (' ip-manager/ ', '/ip-manager'), ('/tools/ip-manager/', '/tools/ip-manager')]:
            with self.subTest(base_path=value):
                client = Client(self.make_app(value), Response)
                response = client.get(prefix + '/login')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json['api'], prefix + '/api/interfaces')
                self.assertEqual(response.json['static'], prefix + '/static/css/style.css')
                self.assertIn('Path=' + (prefix or '/'), response.headers['Set-Cookie'])
                self.assertEqual(client.get(prefix + '/api/interfaces').json, {'ok': True})
                self.assertEqual(client.get(prefix + '/').headers['Location'], prefix + '/login')
                with client.get(prefix + '/static/css/style.css') as static_response:
                    self.assertEqual(static_response.status_code, 200)
                if prefix:
                    self.assertEqual(client.get('/login').status_code, 404)
                    self.assertEqual(client.get(prefix + '-other/login').status_code, 404)


if __name__ == '__main__':
    unittest.main()
