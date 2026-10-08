from models.models import db, Interface, Site, VLAN
from sqlalchemy import inspect, text


def migrate_vendor_vlan_scope(engine):
    if 'vlan_scope' not in {column['name'] for column in inspect(engine).get_columns('vendors')}:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE vendors ADD COLUMN vlan_scope VARCHAR(16) NOT NULL DEFAULT 'interface'"))


def vlan_conflict_ids(ids):
    if not ids:
        return []
    numbers = db.select(VLAN.vlan_id).where(VLAN.id.in_(ids))
    blocked = VLAN.query.filter(VLAN.vlan_id.in_(numbers)).all()
    ids = {row.id for row in blocked}
    blocked_om_pairs = {row.pair_id for row in blocked if row.pair_type == 'om' and row.pair_id}
    if blocked_om_pairs:
        ids.update(row.id for row in VLAN.query.filter(VLAN.pair_id.in_(blocked_om_pairs), VLAN.pair_type == 'service').all())
    return list(ids)


def used_vlan_ids(interface_id, vendor, exclude_site_ids=(), pending=None):
    if not interface_id:
        return []
    interface = db.session.get(Interface, interface_id)
    if interface is None:
        raise ValueError('Interface not found')
    query = Site.query.join(Interface, Site.interface_id == Interface.id)
    interface_ids = {interface.id}
    if vendor and vendor.vlan_scope == 'router':
        query = query.filter(Interface.router_id == interface.router_id)
        interface_ids = {row.id for row in Interface.query.filter_by(router_id=interface.router_id).all()}
    else:
        query = query.filter(Site.interface_id == interface.id)
    if exclude_site_ids:
        query = query.filter(~Site.id.in_(exclude_site_ids))
    ids = {value for site in query.all() for value in (site.service_vlan_id, site.om_vlan_id) if value}
    for identifier in interface_ids:
        ids.update((pending or {}).get(identifier, ()))
    return vlan_conflict_ids(ids)
