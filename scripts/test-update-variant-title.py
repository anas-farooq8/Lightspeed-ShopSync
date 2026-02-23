#!/usr/bin/env python3
"""
Test script: Update variant title via Lightspeed API for multiple languages.

Usage:
  python scripts/test-update-variant-title.py

Set these in .env:
  LIGHTSPEED_API_KEY_BE=...
  LIGHTSPEED_API_SECRET_BE=...

Edit VARIANT_ID, TLD, and titles below before running.
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG (edit these) ─────────────────────────────────────────────────────
TLD = "be"
VARIANT_ID = 320429328
PRODUCT_ID = 161818761  # for context only

# Titles to set per language
TITLE_NL = "Rood label"
TITLE_FR = "Rood label, fr"  # or "Étiquette rouge" etc.
# ─────────────────────────────────────────────────────────────────────────────

API_BASE = "https://api.webshopapp.com"


def get_auth():
    api_key = os.getenv(f"LIGHTSPEED_API_KEY_{TLD.upper()}")
    api_secret = os.getenv(f"LIGHTSPEED_API_SECRET_{TLD.upper()}")
    if not api_key or not api_secret:
        raise SystemExit(
            f"Missing LIGHTSPEED_API_KEY_{TLD.upper()} and LIGHTSPEED_API_SECRET_{TLD.upper()} in .env"
        )
    return (api_key, api_secret)


def fetch_variant(lang: str, auth: tuple) -> dict:
    url = f"{API_BASE}/{lang}/variants/{VARIANT_ID}.json"
    r = requests.get(url, auth=auth, timeout=30)
    r.raise_for_status()
    return r.json().get("variant", {})


def update_variant_title(lang: str, title: str, auth: tuple) -> dict:
    url = f"{API_BASE}/{lang}/variants/{VARIANT_ID}.json"
    payload = {"variant": {"title": title}}
    r = requests.put(url, json=payload, auth=auth, timeout=30)
    r.raise_for_status()
    return r.json().get("variant", {})


def main():
    auth = get_auth()
    print(f"Variant ID: {VARIANT_ID}, Product ID: {PRODUCT_ID}, TLD: {TLD}\n")

    # 1. Fetch current state (nl)
    print("Fetching current variant (nl)...")
    before_nl = fetch_variant("nl", auth)
    print(f"  nl title: {before_nl.get('title', '(none)')}")

    # 2. Update nl
    #print(f"\nUpdating variant title for nl: {TITLE_NL!r}")
    #update_variant_title("nl", TITLE_NL, auth)
    #print("  ✓ nl updated")

    # 3. Update fr
    print(f"\nUpdating variant title for fr: {TITLE_FR!r}")
    update_variant_title("fr", TITLE_FR, auth)
    print("  ✓ fr updated")

    # 4. Fetch after (both langs)
    print("\nFetching after update...")
    after_nl = fetch_variant("nl", auth)
    after_fr = fetch_variant("fr", auth)
    print(f"  nl title: {after_nl.get('title', '(none)')}")
    print(f"  fr title: {after_fr.get('title', '(none)')}")

    print("\nDone. Check Lightspeed admin panel.")


if __name__ == "__main__":
    main()
