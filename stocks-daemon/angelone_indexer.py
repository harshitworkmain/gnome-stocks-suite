import json
import os
import urllib.request
import urllib.error
from datetime import datetime
import re

SCRIP_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
CACHE_FILE = "/dev/shm/angelone_scrip_master.json"

def download_and_index():
    if os.path.exists(CACHE_FILE):
        mtime = os.path.getmtime(CACHE_FILE)
        if (datetime.now().timestamp() - mtime) < 86400:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)

    # Download
    print("Downloading Angel One Scrip Master JSON...")
    req = urllib.request.Request(SCRIP_URL)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())

    # Build an optimized index for search (only equities and indices)
    indexed = []
    print(f"Processing {len(data)} instruments...")
    for item in data:
        exch = item.get("exch_seg")
        sys_type = item.get("instrumenttype")
        symbol = item.get("symbol", "")
        name = item.get("name", "")
        token = item.get("token")

        # We only want NSE Equities and NSE/BSE Indices for simple search right now
        if exch == "NSE" and "-EQ" in symbol:
            indexed.append({
                "symbol": symbol,
                "displayName": name,
                "exchange": "NSE",
                "type": "EQUITY",
                "provider": "angelone",
                "token": token
            })
        elif sys_type == "AMXIDX": # Indices
            indexed.append({
                "symbol": name if name else symbol,
                "displayName": name if name else symbol,
                "exchange": exch,
                "type": "INDEX",
                "provider": "angelone",
                "token": token
            })

    with open(CACHE_FILE, "w") as f:
        json.dump(indexed, f)
    
    print(f"Indexed {len(indexed)} relevant instruments.")
    return indexed

def search_local(query):
    query = query.upper()
    data = download_and_index()
    results = []
    for item in data:
        # Match prefix of symbol or name
        if item["symbol"].startswith(query) or item["displayName"].startswith(query):
            results.append(item)
            if len(results) >= 10:
                break
    return results
