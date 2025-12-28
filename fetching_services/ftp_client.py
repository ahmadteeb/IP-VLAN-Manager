import ftplib
import os
from datetime import datetime
import zipfile
import json

HOST = "10.119.19.80"
USERNAME = "ftpuser"
PASSWORD = "Changeme_123"


class NCE_FTP:
    def __init__(self, download_path: str, host: str = HOST):
        self.download_path = download_path
        os.makedirs(self.download_path, exist_ok=True)
        self.ftp = ftplib.FTP(host)

    def login(self):
        self.ftp.login(USERNAME, PASSWORD)

    def logout(self):
        self.ftp.quit()

    def extract(self, target_report: str, target_filename: str, path: str = "/hfs_public/inventory_dm_report/inventoryReports/"):
        self.ftp.cwd(path)

        # List files and filter NE_Report files
        files = self.ftp.nlst()
        ne_report_files = [f for f in files if f.startswith(target_report) and f.endswith('.csv')]

        if not ne_report_files:
            self.logout()
            raise FileNotFoundError(f"No {target_report} CSV files available on the FTP server.")

        # Function to extract datetime from filename
        def extract_datetime(filename):
            timestamp_str = filename[len(target_report + "_"):-len(".csv")]
            return datetime.strptime(timestamp_str, "%Y-%m-%d_%H-%M-%S")

        # Get the latest file
        latest_file = max(ne_report_files, key=extract_datetime)

        # Download latest file to temporary file
        final_path = os.path.join(self.download_path, target_filename)
        with open(final_path, "wb") as f:
            self.ftp.retrbinary("RETR " + latest_file, f.write)

        return final_path

    def extract_ipran_data(self, path: str = "/hfs_public/nbi/inv/export/5"):
        os.makedirs(f"{self.download_path}/temp", exist_ok=True)
    
        self.ftp.cwd(path)
        current_date = datetime.now()
        current_date = str(current_date.year) + str(current_date.month).zfill(2) + str(current_date.day).zfill(2)
        folders = self.ftp.nlst()

        for folder in folders:
            if current_date in str(folder):
                self.ftp.cwd(f"{path}/{folder}")
                break
        
        files = self.ftp.nlst()
        print("[-] Downloading IPRAN Data...")
        for file in files:
            if any(file.startswith(s) for s in ["ltp-v2", "network-element"]):
                self.ftp.retrbinary("RETR " + file , open(f"{self.download_path}/temp/{file}", 'wb').write)
        print("[*] Downloaded IPRAN Data")

        # Extract the data from the files
        print("[-] Extracting LTP-V2 Data...")
        ltp_v2_files = [f for f in os.listdir(f"{self.download_path}/temp") if f.startswith("ltp-v2")]
        for file in ltp_v2_files:
            with zipfile.ZipFile(f"{self.download_path}/temp/{file}", 'r') as zip_ref:
                zip_ref.extractall(f"{self.download_path}/temp")
            os.remove(f"{self.download_path}/temp/{file}")
        print("[*] Extracted LTP-V2 Data")

        print("[-] Extracting Network-Element Data...")
        network_element_files = [f for f in os.listdir(f"{self.download_path}/temp") if f.startswith("network-element")]
        for file in network_element_files:
            with zipfile.ZipFile(f"{self.download_path}/temp/{file}", 'r') as zip_ref:
                zip_ref.extractall(f"{self.download_path}/temp")
            os.remove(f"{self.download_path}/temp/{file}")
        print("[*] Extracted Network-Element Data")
        
        # Combine the data from the files
        print("[-] Combining LTP-V2 Data...")
        ltp_v2_data = []
        ltp_v2_files = [f for f in os.listdir(f"{self.download_path}/temp") if f.startswith("ltp-v2")]
        for file in ltp_v2_files:
            with open(f"{self.download_path}/temp/{file}", 'r', encoding="utf-8") as f:
                lines = f.readlines()
                for line in lines:
                    ltp_v2_data.append(json.loads(line))
            
            with open(f"{self.download_path}/ltp-v2.json", 'w') as f:
                json.dump(ltp_v2_data, f)
        print("[*] Combined LTP-V2 Data")

        print("[-] Combining Network-Element Data...")
        network_element_data = []
        network_element_files = [f for f in os.listdir(f"{self.download_path}/temp") if f.startswith("network-element")]
        for file in network_element_files:
            with open(f"{self.download_path}/temp/{file}", 'r', encoding="utf-8") as f:
                lines = f.readlines()
                for line in lines:
                    network_element_data.append(json.loads(line))
            
            with open(f"{self.download_path}/network-element.json", 'w') as f:
                json.dump(network_element_data, f)
        print("[*] Combined Network-Element Data")