"""Remove the obsolete stored VLAN status and its indexes."""
from sqlalchemy import inspect, text


def remove_legacy_vlan_status(engine):
    inspector = inspect(engine)
    if not inspector.has_table('vlans'):
        return
    if 'status' not in {column['name'] for column in inspector.get_columns('vlans')}:
        return
    quote = engine.dialect.identifier_preparer.quote
    with engine.begin() as conn:
        for index in inspector.get_indexes('vlans'):
            if 'status' in index['column_names']:
                statement = f'DROP INDEX {quote(index["name"])}'
                if engine.dialect.name in ('mysql', 'mariadb'):
                    statement += ' ON vlans'
                conn.execute(text(statement))
        conn.execute(text('ALTER TABLE vlans DROP COLUMN status'))
