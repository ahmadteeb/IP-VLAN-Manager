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


    # Update Database (Routers Table)
    mysql_engine = create_engine(DATABASE_URL)

    with mysql_engine.connect() as conn:
        for _, row in routers.iterrows():
            query = text("""
                INSERT INTO routers (router_ip, name, router_type)
                VALUES (:router_ip, :name, :router_type)
                ON DUPLICATE KEY UPDATE router_ip = VALUES(router_ip)
            """)

            conn.execute(query, {
                "router_ip": row["ip-address"],
                "name": row["name"],
                "router_type": row["product-name"],
            })
            print(f"Inserted router: {row['name']} - {row['product-name']} - {row['ip-address']}")

        # Important! Commit changes
        conn.commit()

    print("Insert complete. Duplicate routers skipped.")


    # Update Database (Router_Interfaces Table)
    with open(f"{REPORT_PATH}/ltp-v2.json", 'r') as f:
        ltp_v2_data = pd.DataFrame(json.load(f))

    interfaces = ltp_v2_data[(ltp_v2_data['is-physical']) | ((ltp_v2_data['is-sub-ltp'] == False) & (ltp_v2_data['mac'] != "00-00-00-00-00-00"))]

    with mysql_engine.connect() as conn:
        query = text("Select * from routers")
        routers = routers = [dict(row._mapping) for row in conn.execute(query)]

        for router in routers:
            print(f"Inserting Interfaces for router: {router['name']}")
            try:
                ne_id = network_element_data.loc[
                    network_element_data['ip-address'] == router['router_ip'],
                    'res-id'
                    ].iloc[0]
                filtered_interfaces = interfaces[interfaces['ne-id'] == ne_id].to_dict(orient='records')
                for interface in filtered_interfaces:
                    query = text("""
                        INSERT IGNORE INTO interfaces (router_id, name)
                        VALUES (:router_id, :name);
                    """)
                    
                    conn.execute(query, {
                        "router_id": router['id'],
                        "name": interface['name'],
                    });
            
                print(f"Inserted interfaces for router: {router['name']}")
            except IndexError:
                try:
                    query = text("""
                        DELETE FROM interfaces WHERE router_id = :router_id
                    """)
                    conn.execute(query, {
                        "router_id": router['id'],
                    });
                    print(f"Deleted interfaces for router: {router['name']}")
                    query = text("""
                        DELETE FROM routers WHERE id = :router_id
                    """)
                    conn.execute(query, {
                        "router_id": router['id'],
                    });
                    print(f"Deleted router: {router['name']}")
                except Exception as e:
                    print(f"Error deleting interfaces for router: {router['name']} - {e}")
                    with open("routers_need_to_be_deleted.log", "a") as f:
                        f.write(f"{router['name']} - {e}\n")
        conn.commit()

    print("Insert complete. Duplicate interfaces skipped.")
    
    with open(f"success_update_routers.log", "a") as f:
        f.write(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("Routers updated successfully\n")
        f.write("--------------------------------\n")

except Exception as e:
    with open("error_update_routers.log", "a") as f:
        f.write(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Error: {e}\n")
        f.write(f"Error traceback: {traceback.format_exc()}\n")
        f.write("--------------------------------\n")