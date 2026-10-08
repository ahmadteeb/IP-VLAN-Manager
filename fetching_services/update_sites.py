import logging
from collections import defaultdict

from sqlalchemy import text

from service_utils import load_report, run_service


def one(rows, label):
    if len(rows) != 1:
        raise ValueError(f"{label}: expected one match, found {len(rows)}")
    return rows[0]


def vlan_id(link, vlans, current_id, vendor_id):
    name = link.get("native-name") or link.get("name")
    if not isinstance(name, str) or not name:
        raise ValueError("Missing interface name")
    if "." not in name:
        return None
    number = int(name.rsplit(".", 1)[1])
    if not 1 <= number <= 4094:
        raise ValueError(f"Invalid VLAN number: {number}")
    candidates = [row for row in vlans if row["vlan_id"] == number]
    if vendor_id is not None:
        candidates = [row for row in candidates if row["vendor_id"] == vendor_id]
    current = [row for row in candidates if row["id"] == current_id]
    return one(current or candidates, f"VLAN {number}")["id"]


def update_sites(engine, report_path="Reports"):
    elements = load_report(report_path, "network-element.json", ("res-id", "ip-address"))
    links = load_report(report_path, "ltp-v2.json", ("ne-id", "addrv4"))
    by_ne, by_gateway = defaultdict(list), defaultdict(list)
    for row in elements:
        by_ne[row["res-id"]].append(row)
    for row in links:
        if row["addrv4"]:
            by_gateway[row["addrv4"]].append(row)
    updated, skipped = 0, 0
    with engine.begin() as conn:
        sites = list(conn.execute(text("SELECT * FROM sites")).mappings())
        routers = defaultdict(list)
        for row in conn.execute(text("SELECT id, router_ip FROM routers")).mappings():
            routers[row["router_ip"]].append(row)
        interfaces = defaultdict(list)
        for row in conn.execute(text("SELECT id, router_id, name FROM interfaces")).mappings():
            interfaces[(row["router_id"], row["name"])].append(row)
        ips = {row["id"]: row["gateway"] for row in conn.execute(text("SELECT id, gateway FROM ips")).mappings()}
        vlans = list(conn.execute(text("SELECT id, vlan_id, vendor_id FROM vlans")).mappings())
        for site in sites:
            try:
                service = one(by_gateway[ips.get(site["service_ip_id"])], "Service IP")
                ne = one(by_ne[service["ne-id"]], "Network element")
                router = one(routers[ne["ip-address"]], "Router")
                name = service.get("native-name") or service.get("name")
                if not isinstance(name, str) or not name:
                    raise ValueError("Missing service interface name")
                # The router import stores report 'name'; try both report aliases.
                aliases = {alias.split(".", 1)[0] for alias in (name, service.get("name")) if isinstance(alias, str) and alias}
                matches = {row["id"]: row for alias in aliases for row in interfaces[(router["id"], alias)]}
                interface = one(list(matches.values()), "Interface")
                service_vlan = vlan_id(service, vlans, site["service_vlan_id"], site["vendor_id"])
                om_vlan = None
                if site["om_ip_id"] is not None:
                    om = one(by_gateway[ips.get(site["om_ip_id"])], "OM IP")
                    om_vlan = vlan_id(om, vlans, site["om_vlan_id"], site["vendor_id"])
            except (ValueError, TypeError) as error:
                skipped += 1
                logging.warning("Skipped site %s (%s): %s", site["site_id"], site["id"], error)
                continue
            conn.execute(text("UPDATE sites SET service_vlan_id=:service, om_vlan_id=:om, interface_id=:interface WHERE id=:id"), {"service": service_vlan, "om": om_vlan, "interface": interface["id"], "id": site["id"]})
            updated += 1
    logging.info("Sites updated: %s; skipped: %s", updated, skipped)
    return updated, skipped


if __name__ == "__main__":
    run_service("update_sites", update_sites)
