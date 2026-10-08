"""Replace the legacy duplicate cache; source IP/router/interface data is retained."""
from sqlalchemy import inspect, text


def remove_legacy_duplicate_ip_table(engine):
    inspector = inspect(engine)
    if not inspector.has_table('duplicate_IPs'):
        return
    columns = {column['name'] for column in inspector.get_columns('duplicate_IPs')}
    if {'ip_id', 'router_id', 'interface_id', 'checked_at'} <= columns:
        with engine.begin() as conn:
            for name, column_type in (('service_name', 'TEXT'), ('vlan', 'INTEGER')):
                if name not in columns:
                    conn.execute(text(f'ALTER TABLE `duplicate_IPs` ADD COLUMN {name} {column_type}'))
        return
    if not {'ip', 'router_id', 'interface', 'checked_at'} <= columns:
        raise ValueError('Unrecognized duplicate_IPs schema; refusing to drop it')
    with engine.begin() as conn:
        conn.execute(text('DROP TABLE `duplicate_IPs`'))
