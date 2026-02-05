import pandas as pd
import os
from sqlalchemy import create_engine, text
import json
from datetime import datetime
import traceback

REPORT_PATH = "Reports"
DATABASE_URL = os.environ.get("DATABASE_URL")

try:
    # ----------------------------------------------------
    # Load Network Elements
    # ----------------------------------------------------
    with open(f"{REPORT_PATH}/network-element.json", "r") as f:
        network_element_data = pd.DataFrame(json.load(f))

    routers_df = network_element_data[
        network_element_data["ip-address"].str.startswith("10.61.", na=False)
    ]

    # Remove Non IPRAN NEs
    routers_df = routers_df[
        ~routers_df["ip-address"].astype(str).str.startswith("10.61.67.", na=False)
    ]

    mysql_engine = create_engine(DATABASE_URL)

    # ----------------------------------------------------
    # Insert / Update Routers
    # ----------------------------------------------------
    insert_router = text("""
        INSERT INTO routers (router_ip, name, router_type)
        VALUES (:router_ip, :name, :router_type)
        ON DUPLICATE KEY UPDATE router_ip = VALUES(router_ip)
    """)

    with mysql_engine.begin() as conn:
        conn.exec_driver_sql(
            "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED"
        )

        for _, row in routers_df.iterrows():
            conn.execute(insert_router, {
                "router_ip": row["ip-address"],
                "name": row["name"],
                "router_type": row["product-name"],
            })

    print("Routers updated successfully.")

    # ----------------------------------------------------
    # Load Interfaces
    # ----------------------------------------------------
    with open(f"{REPORT_PATH}/ltp-v2.json", "r") as f:
        ltp_v2_data = pd.DataFrame(json.load(f))

    interfaces_df = ltp_v2_data[
        (ltp_v2_data["is-physical"]) |
        (
            (ltp_v2_data["is-sub-ltp"] == False) &
            (ltp_v2_data["mac"] != "00-00-00-00-00-00")
        )
    ]

    # ----------------------------------------------------
    # Fetch Routers from DB
    # ----------------------------------------------------
    with mysql_engine.connect() as conn:
        routers = [
            dict(row._mapping)
            for row in conn.execute(text("SELECT id, name, router_ip FROM routers"))
        ]

    insert_interface = text("""
        INSERT IGNORE INTO interfaces (router_id, name)
        VALUES (:router_id, :name)
    """)

    delete_interfaces = text("""
        DELETE FROM interfaces WHERE router_id = :router_id
    """)

    delete_router = text("""
        DELETE FROM routers WHERE id = :router_id
    """)

    # ----------------------------------------------------
    # Insert Interfaces (ONE TRANSACTION PER ROUTER)
    # ----------------------------------------------------
    for router in routers:
        print(f"Processing interfaces for router: {router['name']}")

        try:
            ne_id = network_element_data.loc[
                network_element_data["ip-address"] == router["router_ip"],
                "res-id"
            ].iloc[0]

            router_interfaces = interfaces_df[
                interfaces_df["ne-id"] == ne_id
            ].to_dict(orient="records")

            with mysql_engine.begin() as conn:
                conn.exec_driver_sql(
                    "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED"
                )

                for interface in router_interfaces:
                    conn.execute(insert_interface, {
                        "router_id": router["id"],
                        "name": interface["name"],
                    })

            print(f"Inserted interfaces for router: {router['name']}")

        except IndexError:
            # Router no longer exists in source → delete safely
            with mysql_engine.begin() as conn:
                conn.exec_driver_sql(
                    "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED"
                )

                conn.execute(delete_interfaces, {
                    "router_id": router["id"],
                })

                conn.execute(delete_router, {
                    "router_id": router["id"],
                })

            print(f"Deleted router and interfaces: {router['name']}")

    # ----------------------------------------------------
    # Success Log
    # ----------------------------------------------------
    with open("success_update_routers.log", "a") as f:
        f.write(f"Time: {datetime.now():%Y-%m-%d %H:%M:%S}\n")
        f.write("Routers and interfaces updated successfully\n")
        f.write("--------------------------------\n")

except Exception as e:
    with open("error_update_routers.log", "a") as f:
        f.write(f"Time: {datetime.now():%Y-%m-%d %H:%M:%S}\n")
        f.write(f"Error: {e}\n")
        f.write(traceback.format_exc())
        f.write("--------------------------------\n")

    raise