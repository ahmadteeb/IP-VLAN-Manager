from sqlalchemy import inspect, text


def migrate_vendor_vlan_scope(engine):
    if 'vlan_scope' not in {column['name'] for column in inspect(engine).get_columns('vendors')}:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE vendors ADD COLUMN vlan_scope VARCHAR(16) NOT NULL DEFAULT 'interface'"))
