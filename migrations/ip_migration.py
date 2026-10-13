"""Replace legacy IP vendor names with vendor relationships before dropping the column."""
from sqlalchemy import inspect, text


def remove_legacy_ip_vendor(engine):
    inspector = inspect(engine)
    if not inspector.has_table('ips'):
        return
    columns = {column['name'] for column in inspector.get_columns('ips')}
    if 'vendor' not in columns:
        return
    if 'vendor_id' not in columns or not inspector.has_table('vendors'):
        raise ValueError('Missing vendor relationship schema; refusing to drop ips.vendor')
    quote = engine.dialect.identifier_preparer.quote
    indexes = inspector.get_indexes('ips')
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO vendors (name)
            SELECT DISTINCT vendor FROM ips
            WHERE vendor_id IS NULL AND vendor IS NOT NULL AND TRIM(vendor) <> ''
              AND NOT EXISTS (SELECT 1 FROM vendors WHERE vendors.name = ips.vendor)
        """))
        conn.execute(text("""
            UPDATE ips SET vendor_id = (SELECT id FROM vendors WHERE vendors.name = ips.vendor)
            WHERE vendor_id IS NULL AND vendor IS NOT NULL AND TRIM(vendor) <> ''
        """))
        for index in indexes:
            if 'vendor' in index['column_names']:
                statement = f'DROP INDEX {quote(index["name"])}'
                if engine.dialect.name in ('mysql', 'mariadb'):
                    statement += ' ON ips'
                conn.execute(text(statement))
        conn.execute(text('ALTER TABLE ips DROP COLUMN vendor'))
