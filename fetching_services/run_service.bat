@echo off
cd /d "C:\Users\ahmad.alkhatib\Desktop\IP MANAGER\fetching_services"
python download_files.py
python update_routers.py
python update_sites.py
