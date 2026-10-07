"""Run with: python -m unittest discover -s fetching_services -p test_*.py"""
import os
from datetime import datetime, time, timezone
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

import scheduler


class SchedulerTest(unittest.TestCase):
    def test_pipeline_order_and_failure(self):
        with patch.object(scheduler.subprocess, "run") as run:
            scheduler.run_cycle()
            self.assertEqual(
                [Path(call.args[0][1]).name for call in run.call_args_list],
                ["download_files.py", "update_routers.py", "update_sites.py"],
            )
            self.assertTrue(all(call.kwargs["check"] for call in run.call_args_list))
        with patch.object(scheduler.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "download")) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                scheduler.run_cycle()
            self.assertEqual(run.call_count, 1)

    def test_start_time_validation(self):
        for value in ("24:00", "02:60", "invalid", "2:00"):
            with patch.dict(os.environ, FETCH_START_TIME=value):
                with self.assertRaises(ValueError):
                    scheduler.main()

    def test_next_daily_start(self):
        for hour, minute, expected in ((1, 30, 1800), (2, 0, 86400), (3, 0, 82800)):
            now = datetime(2026, 10, 7, hour, minute, tzinfo=timezone.utc)
            self.assertEqual(scheduler.seconds_until_start(now, time(2)), expected)

    def test_wait_before_run_and_retry(self):
        with patch.dict(os.environ, FETCH_START_TIME="02:00", TZ="Asia/Amman"), \
                patch.object(scheduler, "ZoneInfo", return_value=timezone.utc), \
                patch.object(scheduler, "seconds_until_start", return_value=60), \
                patch.object(scheduler, "run_cycle", side_effect=subprocess.CalledProcessError(1, "download")) as run, \
                patch.object(scheduler.time, "sleep", side_effect=[None, KeyboardInterrupt]) as sleep, \
                self.assertLogs(level="ERROR"):
            with self.assertRaises(KeyboardInterrupt):
                scheduler.main()
            self.assertEqual([call.args[0] for call in sleep.call_args_list], [60, 60])
            run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
