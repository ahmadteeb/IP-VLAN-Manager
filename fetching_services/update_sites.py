import pandas as pd
import os
from sqlalchemy import create_engine, text
import json
from datetime import datetime
import traceback

try:
    REPORT_PATH = "Reports"
    DATABASE_URL = os.environ.get('DATABASE_URL')

    with open(f"{REPORT_PATH}/network-element.json", 'r') as f:
        network_element_data = pd.DataFrame(json.load(f))

    routers = network_element_data[network_element_data['ip-address'].str.startswith('10.61.', na=False)]

    # Remove Non IPRAN NEs
    routers = routers[~routers['ip-address'].astype(str).str.startswith('10.61.67.', na=False)]
    
    with open(f"{REPORT_PATH}/ltp-v2.json", 'r') as f:
        ltp_v2_data = pd.DataFrame(json.load(f))

    mysql_engine = create_engine(DATABASE_URL)

    with mysql_engine.connect() as conn:
        print("Fetching sites")
        query = text("Select * from sites")
        sites = pd.read_sql(query, conn)
        
        print("Fetching routers")
        query = text("Select * from routers")
        routers = pd.read_sql(query, conn)

        print("Fetching interfaces")
        query = text("Select * from interfaces")
        interfaces = pd.read_sql(query, conn)

        print("Fetching ips")
        query = text("Select * from ips")
        ips = pd.read_sql(query, conn)

        print("Fetching vlans")
        query = text("Select * from vlans")
        vlans = pd.read_sql(query, conn)

        sites_not_updated = []

        for index, site in sites.iterrows():
            print(f"Processing site {index + 1} of {len(sites)}")
            sip_service = ips[ips['id'] == site['service_ip_id']]['gateway'].iloc[0]
            sip_om = ips[ips['id'] == site['om_ip_id']]['gateway'].iloc[0] if site['om_ip_id'] is not None else None
            ltp_v2_services = ltp_v2_data[ltp_v2_data['addrv4'] == sip_service]
            ltp_v2_om = ltp_v2_data[ltp_v2_data['addrv4'] == sip_om] if sip_om is not None else None

            if len(ltp_v2_services) > 1:
                print(f"Site {site['site_id']} - {site['site_name']} | Multiple service IPs found")
                ne_ids = ltp_v2_services['ne-id'].tolist()
                sites_not_updated.append({
                    "site_id": site['site_id'],
                    "site_name": site['site_name'],
                    "error": "Multiple service IPs found",
                    "technology_type": site['technology_type'],
                    "routers": network_element_data[network_element_data['res-id'].isin(ne_ids)]['name'].tolist(),
                })
            
            if len(ltp_v2_services) == 0:
                print(f"Site {site['site_id']} - {site['site_name']} {site['technology_type']} | Service IP not found")
                sites_not_updated.append({
                    "site_id": site['site_id'],
                    "site_name": site['site_name'],
                    "technology_type": site['technology_type'],
                    "error": "Service IP not found",
                })
            else:
                #print(f"Site {site['site_id']} - {site['site_name']} {site['technology_type']}")
                ne_id = ltp_v2_services['ne-id'].iloc[0]
                ne_data = network_element_data[network_element_data['res-id'] == ne_id].iloc[0]
                router_id = routers[routers['router_ip'] == ne_data['ip-address']]['id'].iloc[0]
                ltp_v2_interface_service = ltp_v2_services['native-name'].iloc[0] or ltp_v2_services['name'].iloc[0]
                ltp_v2_interface_om = ltp_v2_om['native-name'].iloc[0] or ltp_v2_om['name'].iloc[0] if ltp_v2_om is not None else None
                
                interface_id = interfaces[(interfaces['router_id'] == router_id) & (interfaces['name'] == ltp_v2_interface_service.split('.')[0])]['id'].iloc[0]
                
                vlan_service_id = (
                    vlans.loc[vlans['vlan_id'] == int(ltp_v2_interface_service.split('.')[1]), 'id']
                    .squeeze()
                    if '.' in ltp_v2_interface_service else None
                )
                vlan_om_id = (
                    vlans.loc[vlans['vlan_id'] == int(ltp_v2_interface_om.split('.')[1]), 'id']
                    .squeeze()
                    if '.' in ltp_v2_interface_om else None
                ) if ltp_v2_om is not None else None
                
                query = text("""
                    UPDATE sites SET service_vlan_id = :vlan_service_id, om_vlan_id = :vlan_om_id, interface_id = :interface_id WHERE id = :id
                """)
                conn.execute(query, {"vlan_service_id": vlan_service_id, "vlan_om_id": vlan_om_id, "interface_id": interface_id, "id": site['id']})
                conn.commit()

    with open("success_update_sites.log", "w") as f:
        f.write(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Sites updated successfully: {len(sites_not_updated)}\n")
        for site in sites_not_updated:
            f.write(f"Site {site['site_id']} - {site['site_name']} {site['technology_type']} | {site['error']}\n")
            if 'routers' in site:
                f.write(f"Routers: {', '.join(site['routers'])}\n")
            f.write("--------------------------------\n")
        f.write("--------------------------------\n")



except Exception as e:
    print(traceback.print_exc())
    with open("error_update_sites.log", "w") as f:
        f.write(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Error: {e}\n")
        f.write(f"Error traceback: {traceback.format_exc()}\n")
        f.write("--------------------------------\n")