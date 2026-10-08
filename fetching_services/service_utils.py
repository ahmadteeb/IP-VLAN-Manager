import json
import ipaddress
import logging
import os
from pathlib import Path
import traceback
from datetime import datetime, timezone

from sqlalchemy import create_engine


def load_report(directory, filename, required):
    with (Path(directory) / filename).open(encoding="utf-8") as file:
        rows = json.load(file)
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{filename} must contain a nonempty list")
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"{filename} row {index}: expected an object")
        missing = [key for key in required if key not in row]
        if missing:
            raise ValueError(f"{filename} row {index}: missing required fields {missing}")
    return rows


def inventory_ipv4(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError('Inventory IPv4 address must be a string')
    value = value.strip()
    if value.casefold() in ('', '--', 'noip', '0.0.0.0'):
        return None
    return str(ipaddress.IPv4Address(value))


def load_ip_links(directory):
    # Unnumbered interfaces omit addrv4 or use an empty/placeholder value.
    rows = load_report(directory, 'ltp-v2.json', ())
    numbered = []
    for index, row in enumerate(rows):
        address = inventory_ipv4(row.get('addrv4'))
        if address is None:
            continue
        if not row.get('ne-id'):
            raise ValueError(f'ltp-v2.json row {index}: IP-bearing interface is missing ne-id')
        numbered.append({**row, 'addrv4': address})
    return numbered


def run_service(name, update):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    engine = None
    try:
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise ValueError("DATABASE_URL must be set")
        engine = create_engine(url, pool_pre_ping=True)
        result = update(engine)
        with open(f"success_{name}.log", "a", encoding="utf-8") as file:
            file.write(f"{datetime.now(timezone.utc).isoformat()} {name} completed: {result}\n")
    except Exception:
        logging.exception("%s failed", name)
        with open(f"error_{name}.log", "a", encoding="utf-8") as file:
            file.write(f"{datetime.now(timezone.utc).isoformat()}\n{traceback.format_exc()}\n")
        raise
    finally:
        if engine is not None:
            engine.dispose()
