"""Remove obsolete site columns after verifying their replacements exist."""
from sqlalchemy import inspect, text


def remove_legacy_site_columns(engine):
    inspector = inspect(engine)
    if not inspector.has_table('sites'):
        return
    columns = {column['name'] for column in inspector.get_columns('sites')}
    legacy = columns & {'technologies', 'vendor'}
    if not legacy:
        return
    if not {'technology_type', 'vendor_id'} <= columns:
        raise ValueError('Missing replacement site columns; refusing to drop legacy columns')
    with engine.begin() as conn:
        for column in sorted(legacy):
            conn.execute(text(f'ALTER TABLE sites DROP COLUMN {column}'))
