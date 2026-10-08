import logging
import ipaddress
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import text

from service_utils import load_report, run_service


def update_routers(engine, report_path="Reports"):
    elements = load_report(report_path, "network-element.json", ("ip-address", "res-id", "name", "product-name"))
    links = load_report(report_path, "ltp-v2.json", ("ne-id", "name", "is-physical", "is-sub-ltp", "mac"))
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
    for row in links:
        if not isinstance(row["is-physical"], bool) or not isinstance(row["is-sub-ltp"], bool):
            raise ValueError("Interface physical/sub-interface flags must be booleans")
        if row["is-physical"] is True or (row["is-sub-ltp"] is False and row["mac"] not in (None, "", "00-00-00-00-00-00")):
            if not isinstance(row["name"], str) or not row["name"].strip():
                raise ValueError("Interface name must be a nonempty string")
            interfaces[row["ne-id"]].add(row["name"])

    added = 0
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
                raise ValueError(f"Conflicting database routers for {row['name']}")
            current = current or (candidates[0] if candidates else None)
            values = {"name": row["name"], "ip": row["ip-address"], "type": row["product-name"]}
            if current:
                router_id = current["id"]
                if router_id in matched:
                    raise ValueError("Multiple inventory routers match the same database router")
                conn.execute(text("UPDATE routers SET name=:name, router_ip=:ip, router_type=:type WHERE id=:id"), {**values, "id": router_id})
            else:
                result = conn.execute(text("INSERT INTO routers (name, router_ip, router_type, created_at) VALUES (:name, :ip, :type, :created)"), {**values, "created": datetime.now(timezone.utc).replace(tzinfo=None)})
                router_id = result.lastrowid
            matched.add(router_id)
            for name in sorted(interfaces[row["res-id"]]):
                if (router_id, name) not in existing:
                    conn.execute(text("INSERT INTO interfaces (router_id, name, created_at) VALUES (:id, :name, :created)"), {"id": router_id, "name": name, "created": datetime.now(timezone.utc).replace(tzinfo=None)})
                    added += 1
        # Inventory exports may be incomplete; removals require an authoritative deletion feed.
        logging.info("Processed %s routers; added %s interfaces; preserved absent records", len(source), added)
    return len(source), added


if __name__ == "__main__":
    run_service("update_routers", update_routers)
