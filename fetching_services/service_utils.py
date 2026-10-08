import json
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
        if not isinstance(row, dict) or any(key not in row for key in required):
            raise ValueError(f"{filename} row {index}: missing required fields {required}")
    return rows


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
