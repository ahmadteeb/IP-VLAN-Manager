from sqlalchemy import inspect, text


def migrate_role_site_vendors(engine):
    if 'site_vendor_ids' not in {column['name'] for column in inspect(engine).get_columns('roles')}:
        with engine.begin() as conn:
            conn.execute(text('ALTER TABLE roles ADD COLUMN site_vendor_ids JSON NULL'))
