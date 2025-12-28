from ftp_client import NCE_FTP
import json
import pandas as pd

REPORT_PATH = "Reports"
NE_REPORT_FILENAME = "NE_Report.csv"
PORT_REPORT_FILENAME = "Port_Report.csv"

ftp = NCE_FTP(REPORT_PATH)
ftp.login()
ftp.extract('NE_Report', NE_REPORT_FILENAME)
ftp.extract('Port_Report', PORT_REPORT_FILENAME)
ftp.extract_ipran_data()
ftp.logout()

with open(f"{REPORT_PATH}/ltp-v2.json", 'r') as f:
    ltp_v2_data = json.load(f)

with open(f"{REPORT_PATH}/network-element.json", 'r') as f:
    network_element_data = json.load(f)


ipplan_df = pd.read_excel(f"{REPORT_PATH}/nokia_ipplan.xlsx")
ipplan_df = ipplan_df[['SiteID', "Site Name", "2G Zain Gateway", "3G Zain Gateway", "4G Zain Gateway", "5G Zain Gateway", "OM Zain Gateway"]]

correct_data = []
errors = []

for index, row in ipplan_df.iterrows():
    print(f"Processing site {index + 1} of {len(ipplan_df)}")
    _2G_GW = row["2G Zain Gateway"]
    _3G_GW = row["3G Zain Gateway"]
    _4G_GW = row["4G Zain Gateway"]
    _5G_GW = row["5G Zain Gateway"]
    _OM_GW = row["OM Zain Gateway"]

    site = {
        "site_id": row["SiteID"],
        "site_name": str(row["SiteID"]) + " - " + str(row["Site Name"]),
        "2G_GW": _2G_GW,
        "3G_GW": _3G_GW,
        "4G_GW": _4G_GW,
        "5G_GW": _5G_GW,
        "OM_GW": _OM_GW,
    }
    
    _2G_data = list(filter(lambda x: x.get('addrv4') == _2G_GW, ltp_v2_data))
    _3G_data = list(filter(lambda x: x.get('addrv4') == _3G_GW, ltp_v2_data))
    _4G_data = list(filter(lambda x: x.get('addrv4') == _4G_GW, ltp_v2_data))
    _5G_data = list(filter(lambda x: x.get('addrv4') == _5G_GW, ltp_v2_data))
    _OM_data = list(filter(lambda x: x.get('addrv4') == _OM_GW, ltp_v2_data))

    if len(_OM_data) == 0:
        print(f"Site {row['SiteID']}-{row['Site Name']} not found")
        errors.append(
            {
                "site_id": row["SiteID"],
                "site_name": str(row["SiteID"]) + " - " + str(row["Site Name"]),
                "error": "Site not found",
            }
        )
    elif len(_OM_data) > 1:
        print(f"Site {row['SiteID']}-{row['Site Name']} multiple sites found")
        ne_ids = [data['ne-id'] for data in _OM_data]
        routers = list(filter(lambda x: x.get('res-id') in ne_ids, network_element_data))
        errors.append(
            {
                "site_id": row["SiteID"],
                "site_name": str(row["SiteID"]) + " - " + str(row["Site Name"]),
                "error": "Multiple sites found",
                "routers": [router['name'] for router in routers]
            }
        )
    else:
        print(f"Site {row['SiteID']}-{row['Site Name']} found")
        _2G_interface = (_2G_data[0].get('native-name') or _2G_data[0].get('name')) if len(_2G_data) else None
        _3G_interface = (_3G_data[0].get('native-name') or _3G_data[0].get('name')) if len(_3G_data) else None
        _4G_interface = (_4G_data[0].get('native-name') or _4G_data[0].get('name')) if len(_4G_data) else None
        _5G_interface = (_5G_data[0].get('native-name') or _5G_data[0].get('name')) if len(_5G_data) else None
        _OM_interface = (_OM_data[0].get('native-name') or _OM_data[0].get('name')) if len(_OM_data) else None

        interface = _OM_interface.split('.')[0]

        site['2G_vlan'] = _2G_interface.split('.')[-1] if _2G_interface is not None else None
        site['3G_vlan'] = _3G_interface.split('.')[-1] if _3G_interface is not None else None
        site['4G_vlan'] = _4G_interface.split('.')[-1] if _4G_interface is not None else None
        site['5G_vlan'] = _5G_interface.split('.')[-1] if _5G_interface is not None else None
        site['OM_vlan'] = _OM_interface.split('.')[-1] if _OM_interface is not None else None
        
        ne_id = _OM_data[0]['ne-id']
        ne_data = list(filter(lambda x: x.get('res-id') == ne_id, network_element_data))

        site['router_ip'] = ne_data[0]['ip-address']
        site['router_interface'] = interface
        site['router_name'] = ne_data[0]['name']

        correct_data.append(site)

with pd.ExcelWriter("output.xlsx", engine="xlsxwriter") as writer:
    correct_data_df = pd.DataFrame(correct_data)
    correct_data_df.to_excel(writer, sheet_name="Correct Data", index=False)
    errors_df = pd.DataFrame(errors)
    errors_df.to_excel(writer, sheet_name="Errors", index=False)
