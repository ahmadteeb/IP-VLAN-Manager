from ftp_client import NCE_FTP
import shutil, os
from datetime import datetime

try:
    REPORT_PATH = "Reports"

    shutil.rmtree(REPORT_PATH, ignore_errors=True)
    os.makedirs(REPORT_PATH, exist_ok=True)

    ftp = NCE_FTP(REPORT_PATH)
    ftp.login()
    ftp.extract_ipran_data()
    ftp.logout()

except Exception as e:
    with open("error_download_files.log", "a") as f:
        f.write(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Error: {e}\n")
        f.write("--------------------------------\n")