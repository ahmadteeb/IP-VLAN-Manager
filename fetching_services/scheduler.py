"""Run the fetching pipeline daily at a configured local time."""
from datetime import datetime, timedelta
import logging
import os
from pathlib import Path
import subprocess
import sys
import time
from zoneinfo import ZoneInfo


def run_cycle():
    for script in ("download_files.py", "update_routers.py", "update_sites.py", "check_duplicated_ips.py"):
        subprocess.run([sys.executable, str(Path(__file__).with_name(script))], check=True)


def seconds_until_start(now, start_time):
    target = datetime.combine(now.date(), start_time, tzinfo=now.tzinfo)
    if target <= now:
        target += timedelta(days=1)
    return target.timestamp() - now.timestamp()


def main():
    value = os.environ.get("FETCH_START_TIME", "02:00")
    start_time = datetime.strptime(value, "%H:%M").time()
    if start_time.strftime("%H:%M") != value:
        raise ValueError("FETCH_START_TIME must use HH:MM (24-hour time)")
    timezone = ZoneInfo(os.environ.get("TZ", "Asia/Amman"))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    while True:
        delay = seconds_until_start(datetime.now(timezone), start_time)
        logging.info("Next fetching cycle at %s (%s), in %.0f seconds", value, timezone, delay)
        time.sleep(delay)
        try:
            logging.info("Starting fetching cycle")
            run_cycle()
            logging.info("Fetching cycle complete")
        except subprocess.CalledProcessError:
            logging.exception("Fetching cycle failed; retrying at the next daily start time")


if __name__ == "__main__":
    main()
