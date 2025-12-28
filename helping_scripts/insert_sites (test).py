import pandas as pd
from sqlalchemy import create_engine, text
import os
from datetime import datetime

DATABASE_URL = os.environ.get('DATABASE_URL')

mysql_engine = create_engine(DATABASE_URL)

with mysql_engine.connect() as conn:
    query = text("Select * from routers")
    routers = routers = [dict(row._mapping) for row in conn.execute(query)]

    query = text("Select * from vlans")
    vlans = [dict(row._mapping) for row in conn.execute(query)]
    

    query = text("Select * from ips")
    ips = [dict(row._mapping) for row in conn.execute(query)]

    query = text("Select * from interfaces")
    interfaces = [dict(row._mapping) for row in conn.execute(query)]

VENDOR_ID = 4

sites = pd.read_excel("output.xlsx", sheet_name="Correct Data").to_dict(orient='records')


def insert_site(data):
    with mysql_engine.connect() as conn:
        query = text("""
        INSERT INTO sites (site_id, site_name, technology_type, technologies, vendor, vendor_id, service_ip_id, om_ip_id, service_vlan_id, om_vlan_id, interface_id, assigned_date, created_at)
                    VALUES
                    (
                    :site_id,
                    :site_name,
                    :technology_type,
                    :technologies,
                    :vendor,
                    :vendor_id,
                    :service_ip_id,
                    :om_ip_id,
                    :service_vlan_id,
                    :om_vlan_id,
                    :interface_id,
                    :assigned_date,
                        :created_at);
        """)
        conn.execute(query, data)
        conn.commit()

for site in sites:
    print(f"Processing site {site['site_id']} - {site['site_name']}")
    router_ip = site['router_ip']
    router_id = list(filter(lambda x: x['router_ip'] == router_ip, routers))[0]['id']
    
    interface_id = list(filter(lambda x: x['router_id'] == router_id and x['name'] == site['router_interface'], interfaces))[0]['id']
    
    _2G_vlan_id = list(filter(lambda x: x['vlan_id'] == site['2G_vlan'], vlans))[0]['id']
    _2G_gw_id = list(filter(lambda x: x['gateway'] == site['2G_GW'], ips))[0]['id']
    
    data = {
        "site_id": site['site_id'],
        "site_name": site['site_name'],
        "technology_type": "2G",
        "technologies": '["2G"]',
        "vendor": "Nokia",
        "vendor_id": VENDOR_ID,
        "ip_id": _2G_gw_id,
        "vlan_id": _2G_vlan_id,
        "service_ip_id": _2G_gw_id,
        "om_ip_id": None,
        "service_vlan_id": _2G_vlan_id,
        "om_vlan_id": None,
        "interface_id": interface_id,
        "assigned_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }

    insert_site(data)

    _3G_vlan_id = list(filter(lambda x: x['vlan_id'] == site['3G_vlan'], vlans))[0]['id']
    _3G_gw_id = list(filter(lambda x: x['gateway'] == site['3G_GW'], ips))[0]['id']
    
    data = {
        "site_id": site['site_id'],
        "site_name": site['site_name'],
        "technology_type": "3G",
        "technologies": '["3G"]',
        "vendor": "Nokia",
        "vendor_id": VENDOR_ID,
        "ip_id": _3G_gw_id,
        "vlan_id": _3G_vlan_id, 
        "service_ip_id": _3G_gw_id,
        "om_ip_id": None,
        "service_vlan_id": _3G_vlan_id,
        "om_vlan_id": None,
        "interface_id": interface_id,
        "assigned_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }
    insert_site(data)

    _4G_vlan_id = list(filter(lambda x: x['vlan_id'] == site['4G_vlan'], vlans))[0]['id']
    _4G_gw_id = list(filter(lambda x: x['gateway'] == site['4G_GW'], ips))[0]['id']
    
    data = {
        "site_id": site['site_id'],
        "site_name": site['site_name'],
        "technology_type": "4G",
        "technologies": '["4G"]',
        "vendor": "Nokia",
        "vendor_id": VENDOR_ID,
        "ip_id": _4G_gw_id,
        "vlan_id": _4G_vlan_id, 
        "service_ip_id": _4G_gw_id,
        "om_ip_id": None,
        "service_vlan_id": _4G_vlan_id,
        "om_vlan_id": None,
        "interface_id": interface_id,
        "assigned_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }
    insert_site(data)
    
    _5G_vlan_id = list(filter(lambda x: x['vlan_id'] == site['5G_vlan'], vlans))[0]['id']
    _5G_gw_id = list(filter(lambda x: x['gateway'] == site['5G_GW'], ips))[0]['id']
    
    data = {
        "site_id": site['site_id'],
        "site_name": site['site_name'],
        "technology_type": "5G",
        "technologies": '["5G"]',
        "vendor": "Nokia",
        "vendor_id": VENDOR_ID,
        "ip_id": _5G_gw_id,
        "vlan_id": _5G_vlan_id, 
        "service_ip_id": _5G_gw_id,
        "om_ip_id": None,
        "service_vlan_id": _5G_vlan_id,
        "om_vlan_id": None,
        "interface_id": interface_id,
        "assigned_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }
    insert_site(data)
    
    _OM_vlan_id = list(filter(lambda x: x['vlan_id'] == site['OM_vlan'], vlans))[0]['id']
    _OM_gw_id = list(filter(lambda x: x['gateway'] == site['OM_GW'], ips))[0]['id']

    data = {
        "site_id": site['site_id'],
        "site_name": site['site_name'],
        "technology_type": "OM",
        "technologies": '["OM"]',
        "vendor": "Nokia",
        "vendor_id": VENDOR_ID,
        "ip_id": _OM_gw_id,
        "vlan_id": _OM_vlan_id,
        "service_ip_id": _OM_gw_id,
        "om_ip_id": None,
        "service_vlan_id": _OM_vlan_id,
        "om_vlan_id": None,
        "interface_id": interface_id,
        "assigned_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }
    insert_site(data)

print("Sites inserted successfully")