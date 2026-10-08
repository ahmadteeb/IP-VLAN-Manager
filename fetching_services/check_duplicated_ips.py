"""Save the latest successful duplicate-IP inventory scan atomically."""
from collections import defaultdict
from datetime import datetime, timezone
import ipaddress
import logging

from sqlalchemy import text

from service_utils import inventory_ipv4, load_ip_links, load_report, run_service


def find_duplicates(elements, links, database_routers, database_ips, database_interfaces):
    routers = {}
    for row in elements:
        if row['res-id'] in routers:
            raise ValueError(f"Duplicate network element ID: {row['res-id']}")
        routers[row['res-id']] = row
    addresses = defaultdict(dict)
    by_ip = defaultdict(list)
    ambiguous = set()
    for router in database_routers:
        by_ip[router['router_ip']].append(router['id'])
    technologies = {}
    interfaces = defaultdict(list)
    for row in database_interfaces:
        interfaces[(row['router_id'], row['name'])].append(row['id'])
    for row in database_ips:
        if isinstance(row['type'], str) and row['type'].strip():
            address = inventory_ipv4(row['gateway'])
            if address is not None:
                technologies[address] = row
    for row in links:
        address = inventory_ipv4(row.get('addrv4'))
        if address is None:
            continue
        ip = technologies.get(address)
        if ip is None:
            continue
        interface = row.get('native-name') or row.get('name')
        if not isinstance(interface, str) or not interface.strip():
            raise ValueError('Missing interface name for an IP-bearing inventory record')
        router = routers.get(row['ne-id'])
        if router is None:
            raise ValueError(f"Unknown network element: {row['ne-id']}")
        matches = by_ip[router['ip-address']]
        if not matches:
            logging.warning('Skipping inventory router %s: not present in routers table', router['ip-address'])
            continue
        if len(matches) != 1:
            if router['ip-address'] not in ambiguous:
                logging.warning('Skipping router IP %s: matches database router IDs %s', router['ip-address'], matches)
                ambiguous.add(router['ip-address'])
            continue
        router_id = matches[0]
        aliases = {name for name in (interface, row.get('name')) if isinstance(name, str) and name}
        interface_ids = {identifier for name in aliases for identifier in interfaces[(router_id, name)]}
        if not interface_ids:
            # Router imports retain parent interfaces for inventory subinterfaces.
            interface_ids = {identifier for name in aliases for identifier in interfaces[(router_id, name.split('.', 1)[0])]}
        if len(interface_ids) != 1:
            logging.warning('Skipping interface %s on router ID %s: found %s matching interfaces', interface, router_id, len(interface_ids))
            continue
        interface_id = next(iter(interface_ids))
        description = row.get('description')
        if description is not None and not isinstance(description, str):
            raise ValueError('Inventory description must be a string')
        suffix = interface.rsplit('.', 1)[-1] if '.' in interface else ''
        vlan = int(suffix) if suffix.isascii() and suffix.isdigit() else None
        if vlan is not None and not 1 <= vlan <= 4094:
            raise ValueError(f'Invalid VLAN number: {vlan}')
        key = (router_id, interface_id)
        addresses[(address, ip['id'])][key] = {
            'router_id': router_id, 'interface_id': interface_id,
            'service_name': description.strip() or None if description is not None else None,
            'vlan': vlan,
        }
    return [
        {'ip_id': ip_id, 'occurrences': sorted(occurrences.values(), key=lambda item: (item['router_id'], item['interface_id']))}
        for (address, ip_id), occurrences in sorted(addresses.items(), key=lambda item: (ipaddress.IPv4Address(item[0][0]), item[0][1]))
        if len(occurrences) > 1
    ]


def check_duplicated_ips(engine, report_path='Reports'):
    elements = load_report(report_path, 'network-element.json', ('res-id', 'name', 'ip-address'))
    links = load_ip_links(report_path)
    with engine.begin() as conn:
        routers = list(conn.execute(text('SELECT id, router_ip FROM routers')).mappings())
        ips = list(conn.execute(text('SELECT id, gateway, type FROM ips')).mappings())
        interfaces = list(conn.execute(text('SELECT id, router_id, name FROM interfaces')).mappings())
        results = find_duplicates(elements, links, routers, ips, interfaces)
        checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        rows = [{'ip_id': group['ip_id'], 'router_id': item['router_id'],
                 'interface_id': item['interface_id'], 'checked_at': checked_at,
                 'service_name': item['service_name'], 'vlan': item['vlan']}
                for group in results for item in group['occurrences']]
        conn.execute(text('DELETE FROM `duplicate_IPs`'))
        if rows:
            conn.execute(text('INSERT INTO `duplicate_IPs` (ip_id, router_id, interface_id, checked_at, service_name, vlan) '
                              'VALUES (:ip_id, :router_id, :interface_id, :checked_at, :service_name, :vlan)'), rows)
    logging.info('Duplicated IPs scan complete: %s duplicated addresses', len(results))
    return len(results)


if __name__ == '__main__':
    run_service('check_duplicated_ips', check_duplicated_ips)
