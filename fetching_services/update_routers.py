import logging
import ipaddress
from collections import Counter, defaultdict
from datetime import datetime, timezone

from sqlalchemy import text

from service_utils import load_report, run_service


def update_routers(engine, report_path="Reports"):
    elements = load_report(report_path, "network-element.json", ("ip-address", "res-id", "name", "product-name"))
    links = load_report(report_path, "ltp-v2.json", ())
    inventory_names = {row['name'] for row in elements}
    inventory_ips = {row['ip-address'] for row in elements}
    source = []
    names, addresses, identifiers = set(), set(), set()
    for row in elements:
        address = row["ip-address"]
        if not isinstance(address, str) or not address.startswith("10.61.") or address.startswith("10.61.67."):
            continue
        ipaddress.IPv4Address(address)
        if not isinstance(row["res-id"], (str, int)) or isinstance(row["res-id"], bool) or row["res-id"] == "":
            raise ValueError("Router res-id must be a nonempty string or integer")
        if not all(isinstance(row[key], str) and row[key].strip() for key in ("name", "product-name")):
            raise ValueError("Router name and product-name must be nonempty strings")
        if row["name"] in names or address in addresses or row["res-id"] in identifiers:
            raise ValueError(f"Duplicate router in inventory: {row['name']} / {address}")
        names.add(row["name"])
        addresses.add(address)
        identifiers.add(row["res-id"])
        source.append(row)

    interfaces = defaultdict(set)
    skipped_interfaces = Counter()
    for index, row in enumerate(links):
        if row.get('ne-id') is None:
            skipped_interfaces['missing ne-id'] += 1
            continue
        if row['ne-id'] not in identifiers:
            continue
        physical, sub_ltp, mac = row.get('is-physical'), row.get('is-sub-ltp'), row.get('mac')
        if any(flag is not None and not isinstance(flag, bool) for flag in (physical, sub_ltp)):
            raise ValueError(f"ltp-v2.json row {index}: physical/sub-interface flags must be booleans")
        if physical is True or (sub_ltp is False and mac not in (None, "", "--", "00-00-00-00-00-00")):
            if not isinstance(row.get("name"), str) or not row["name"].strip():
                raise ValueError(f"ltp-v2.json row {index}: interface name must be a nonempty string")
            interfaces[row["ne-id"]].add(row["name"])
        elif sub_ltp is not True and physical is not True:
            skipped_interfaces['insufficient classification or MAC'] += 1
    for reason, count in skipped_interfaces.items():
        logging.warning('Skipped %s interface rows: %s', count, reason)

    added = skipped_routers = 0
    with engine.begin() as conn:
        routers = list(conn.execute(text("SELECT id, name, router_ip FROM routers")).mappings())
        by_name = {row["name"]: row for row in routers}
        by_ip = defaultdict(list)
        for row in routers:
            by_ip[row["router_ip"]].append(row)
        existing = set(conn.execute(text("SELECT router_id, name FROM interfaces")).tuples())
        matched = set()
        for row in source:
            candidates = by_ip[row["ip-address"]]
            current = by_name.get(row["name"])
            if len(candidates) > 1 or (current and candidates and current["id"] != candidates[0]["id"]):
                logging.warning('Skipped router %s (%s): name matches ID %s; IP matches IDs %s',
                                row['name'], row['ip-address'], current['id'] if current else None,
                                [candidate['id'] for candidate in candidates])
                skipped_routers += 1
                continue
            current = current or (candidates[0] if candidates else None)
            values = {"name": row["name"], "ip": row["ip-address"], "type": row["product-name"]}
            if current:
                router_id = current["id"]
                if router_id in matched:
                    logging.warning('Skipped router %s: database router ID %s already matched', row['name'], router_id)
                    skipped_routers += 1
                    continue
                conn.execute(text("UPDATE routers SET name=:name, router_ip=:ip, router_type=:type WHERE id=:id"), {**values, "id": router_id})
            else:
                result = conn.execute(text("INSERT INTO routers (name, router_ip, router_type, created_at) VALUES (:name, :ip, :type, :created)"), {**values, "created": datetime.now(timezone.utc).replace(tzinfo=None)})
                router_id = result.lastrowid
            matched.add(router_id)
            for name in sorted(interfaces[row["res-id"]]):
                if (router_id, name) not in existing:
                    conn.execute(text("INSERT INTO interfaces (router_id, name, created_at) VALUES (:id, :name, :created)"), {"id": router_id, "name": name, "created": datetime.now(timezone.utc).replace(tzinfo=None)})
                    added += 1
        removed = [row for row in routers if row['id'] not in matched
                   and row['name'] not in inventory_names and row['router_ip'] not in inventory_ips]
        for router in removed:
            values = {'id': router['id']}
            detached = conn.execute(text('UPDATE sites SET interface_id=NULL WHERE interface_id IN '
                                         '(SELECT id FROM interfaces WHERE router_id=:id)'), values).rowcount
            conn.execute(text('DELETE FROM `duplicate_IPs` WHERE router_id=:id OR interface_id IN '
                              '(SELECT id FROM interfaces WHERE router_id=:id)'), values)
            conn.execute(text('DELETE FROM interfaces WHERE router_id=:id'), values)
            conn.execute(text('DELETE FROM routers WHERE id=:id'), values)
            logging.info('Removed router ID %s (%s) and its interfaces; kept %s sites with no router/interface assignment', router['id'], router['name'], detached)
        logging.info("Updated %s routers; skipped %s conflicts; added %s interfaces; removed %s routers", len(matched), skipped_routers, added, len(removed))
    return len(matched), added


if __name__ == "__main__":
    run_service("update_routers", update_routers)
