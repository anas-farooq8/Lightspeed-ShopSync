#!/usr/bin/env python3
"""
Update variant image to null via Lightspeed API.
Usage: python scripts/update-variant-image-null.py
"""
import os
import json
import base64
import requests
from dotenv import load_dotenv

load_dotenv()

VARIANT_ID = 320422464
SHOP_TLD = "de"

api_key = os.getenv(f"LIGHTSPEED_API_KEY_{SHOP_TLD.upper()}")
api_secret = os.getenv(f"LIGHTSPEED_API_SECRET_{SHOP_TLD.upper()}")

if not api_key or not api_secret:
    print(f"Error: Set LIGHTSPEED_API_KEY_{SHOP_TLD.upper()} and LIGHTSPEED_API_SECRET_{SHOP_TLD.upper()} in .env")
    exit(1)

url = f"https://api.webshopapp.com/{SHOP_TLD}/variants/{VARIANT_ID}.json"
auth = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
headers = {
    "Authorization": f"Basic {auth}",
    "Content-Type": "application/json",
}
# Test: null and false both get 200 but image stays. Likely API limitation.
payload = {"variant": {"image": None}}

print(f"PUT {url}")
print(f"Body: {json.dumps(payload, indent=2)}")
print()

resp = requests.put(url, json=payload, headers=headers, timeout=30)
print(f"Status: {resp.status_code}")
print(f"Response:\n{json.dumps(resp.json(), indent=2)}")
