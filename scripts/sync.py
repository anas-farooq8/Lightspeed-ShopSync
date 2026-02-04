import os
import time
import requests
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from supabase import create_client

# =====================================================
# ENV
# =====================================================
load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

LIMIT = 250
API_TIMEOUT = 30
MAX_RETRIES = 3

PRODUCT_FIELDS = "id,visibility,url,title,fulltitle,description,content,image,createdAt,updatedAt"
VARIANT_FIELDS = "id,isDefault,sku,priceExcl,title,image,product"

# =====================================================
# API HELPERS
# =====================================================
def normalize_image(img):
    """Normalize image dict to contain only title, thumb, src."""
    if isinstance(img, dict):
        return {
            "title": img.get("title"),
            "thumb": img.get("thumb"),
            "src": img.get("src"),
        }
    return None


def fetch_products(lang, api_key, api_secret):
    products, page = [], 1
    url = f"https://api.webshopapp.com/{lang}/products.json"

    while True:
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.get(
                    url,
                    params={"limit": LIMIT, "page": page, "fields": PRODUCT_FIELDS},
                    auth=(api_key, api_secret),
                    timeout=API_TIMEOUT,
                )
                r.raise_for_status()
                break
            except (requests.exceptions.RequestException, requests.exceptions.Timeout) as e:
                if attempt == MAX_RETRIES - 1:
                    raise
                wait_time = 2 ** attempt  # exponential backoff: 1s, 2s, 4s
                print(f"   ⚠️  Retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s: {e}")
                time.sleep(wait_time)

        batch = r.json().get("products", [])
        if not batch:
            break

        for p in batch:
            p["image"] = normalize_image(p.get("image"))

        products.extend(batch)
        if len(batch) < LIMIT:
            break
        page += 1

    return products


def fetch_variants(lang, api_key, api_secret):
    variants, page = [], 1
    url = f"https://api.webshopapp.com/{lang}/variants.json"

    while True:
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.get(
                    url,
                    params={"limit": LIMIT, "page": page, "fields": VARIANT_FIELDS},
                    auth=(api_key, api_secret),
                    timeout=API_TIMEOUT,
                )
                r.raise_for_status()
                break
            except (requests.exceptions.RequestException, requests.exceptions.Timeout) as e:
                if attempt == MAX_RETRIES - 1:
                    raise
                wait_time = 2 ** attempt  # exponential backoff: 1s, 2s, 4s
                print(f"   ⚠️  Retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s: {e}")
                time.sleep(wait_time)

        batch = r.json().get("variants", [])
        if not batch:
            break

        for v in batch:
            v["image"] = normalize_image(v.get("image"))

        variants.extend(batch)
        if len(batch) < LIMIT:
            break
        page += 1

    return variants


def attach_variants(products, variants, shop_name=None):
    by_product = defaultdict(list)

    for v in variants:
        pid = v.get("product", {}).get("resource", {}).get("id")
        if pid:
            v.pop("product", None)
            by_product[pid].append(v)

    product_ids = {p["id"] for p in products}
    
    for p in products:
        p["variants"] = by_product.get(p["id"], [])
    
    # Check for variants attached to non-existent products
    for pid, variants_list in by_product.items():
        if pid not in product_ids:
            shop_prefix = f"[{shop_name}] " if shop_name else ""
            print(f"   ⚠️  {shop_prefix}{len(variants_list)} variant(s) reference non-existent product ID {pid} & variant IDs {[v['id'] for v in variants_list]}")

    return products


# =====================================================
# DB HELPERS
# =====================================================
def bulk_upsert(supabase, table, rows, conflict_cols):
    if not rows:
        return
    try:
        supabase.table(table).upsert(rows, on_conflict=conflict_cols).execute()
    except Exception as e:
        print(f"   ❌ Failed to upsert {len(rows)} rows to {table}: {e}")
        raise


# =====================================================
# SYNC ONE SHOP
# =====================================================
def sync_shop(shop):
    # Create thread-safe Supabase client for this shop
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print(f"🔄 Syncing shop: {shop['name']}")
    
    # Create sync log entry
    log_result = supabase.table("sync_logs").insert({
        "shop_id": shop["id"],
        "status": "running"
    }).execute()
    log_id = log_result.data[0]["id"]
    
    # Metrics tracking
    metrics = {
        "products_fetched": 0,
        "variants_fetched": 0,
        "products_synced": 0,
        "variants_synced": 0,
        "products_deleted": 0,
        "variants_deleted": 0,
        "variants_filtered": 0
    }

    try:
        # credentials resolved via TLD
        tld = shop["tld"].upper()
        api_key = os.getenv(f"LIGHTSPEED_API_KEY_{tld}")
        api_secret = os.getenv(f"LIGHTSPEED_API_SECRET_{tld}")

        if not api_key or not api_secret:
            raise RuntimeError(f"Missing API credentials for shop TLD={tld}")

        languages = shop["shop_languages"]
        base_lang = next(l["code"] for l in languages if l["is_default"])
        active_langs = [l["code"] for l in languages if l["is_active"]]

        # -------------------------------------------------
        # BASE LANGUAGE (FULL FETCH)
        # -------------------------------------------------
        with ThreadPoolExecutor(max_workers=2) as executor:
            products_future = executor.submit(fetch_products, base_lang, api_key, api_secret)
            variants_future = executor.submit(fetch_variants, base_lang, api_key, api_secret)
        
            products = products_future.result()
            variants = variants_future.result()
    
        metrics["products_fetched"] = len(products)
        metrics["variants_fetched"] = len(variants)
    
        print(f"   📊 [{shop['name']}] Fetched {len(products)} products, {len(variants)} variants from API")
    
        products = attach_variants(products, variants, shop['name'])
        
        # Count filtered variants (orphaned)
        metrics["variants_filtered"] = len(variants) - sum(len(p["variants"]) for p in products)

        product_rows = []
        content_rows = []
        variant_rows = []
        variant_content_rows = []

        for p in products:
            product_rows.append({
                "shop_id": shop["id"],
                "lightspeed_product_id": p["id"],
                "visibility": p.get("visibility"),
                "image": p.get("image"),
                "ls_created_at": p.get("createdAt"),
                "ls_updated_at": p.get("updatedAt"),
            })

            content_rows.append({
                "shop_id": shop["id"],
                "lightspeed_product_id": p["id"],
                "language_code": base_lang,
                "url": p.get("url"),
                "title": p.get("title"),
                "fulltitle": p.get("fulltitle"),
                "description": p.get("description"),
                "content": p.get("content"),
            })

            for v in p["variants"]:
                variant_rows.append({
                    "shop_id": shop["id"],
                    "lightspeed_product_id": p["id"],
                    "lightspeed_variant_id": v["id"],
                    "sku": v["sku"],
                    "is_default": v.get("isDefault"),
                    "price_excl": v.get("priceExcl"),
                    "image": v.get("image"),
                })

                variant_content_rows.append({
                    "shop_id": shop["id"],
                    "lightspeed_variant_id": v["id"],
                    "language_code": base_lang,
                    "title": v.get("title"),
                })

        print(f"   📊 [{shop['name']}] Built {len(product_rows)} products, {len(variant_rows)} variants to upsert")
        metrics["products_synced"] = len(product_rows)
        metrics["variants_synced"] = len(variant_rows)
    
        bulk_upsert(supabase, "products", product_rows, "shop_id,lightspeed_product_id")
        bulk_upsert(supabase, "product_content", content_rows, "shop_id,lightspeed_product_id,language_code")
        bulk_upsert(supabase, "variants", variant_rows, "shop_id,lightspeed_variant_id")
        bulk_upsert(supabase, "variant_content", variant_content_rows, "shop_id,lightspeed_variant_id,language_code")

        # -------------------------------------------------
        # CLEANUP: DELETE ORPHANED PRODUCTS & VARIANTS
        # -------------------------------------------------
        # Compare API products vs DB products
        api_product_ids = {p["id"] for p in products}
    
        existing_products = (
            supabase.table("products")
            .select("lightspeed_product_id")
            .eq("shop_id", shop["id"])
            .execute()
            .data
        )
    
        existing_product_ids = {r["lightspeed_product_id"] for r in existing_products}
        orphaned_products = existing_product_ids - api_product_ids

        if orphaned_products:
            supabase.table("products").delete() \
                .eq("shop_id", shop["id"]) \
                .in_("lightspeed_product_id", list(orphaned_products)) \
                .execute()
            metrics["products_deleted"] = len(orphaned_products)
            print(f"   🗑️  Deleted {len(orphaned_products)} orphaned products")

        # Compare API variants vs DB variants
        api_variant_ids = {v["lightspeed_variant_id"] for v in variant_rows}
    
        existing_variants = (
            supabase.table("variants")
            .select("lightspeed_variant_id")
            .eq("shop_id", shop["id"])
            .execute()
            .data
        )
    
        existing_variant_ids = {r["lightspeed_variant_id"] for r in existing_variants}
        orphaned_variants = existing_variant_ids - api_variant_ids

        if orphaned_variants:
            supabase.table("variants").delete() \
                .eq("shop_id", shop["id"]) \
                .in_("lightspeed_variant_id", list(orphaned_variants)) \
                .execute()
            metrics["variants_deleted"] = len(orphaned_variants)
            print(f"   🗑️  Deleted {len(orphaned_variants)} orphaned variants")

        # -------------------------------------------------
        # SECONDARY LANGUAGES (CONTENT ONLY)
        # -------------------------------------------------
        # Get valid IDs from DB (after base language sync and cleanup)
        valid_product_ids = api_product_ids  # Products that were successfully synced
        valid_variant_ids = api_variant_ids  # Variants that passed filtering and were synced
    
        for lang in active_langs:
            if lang == base_lang:
                continue

            print(f"   ↳ [{shop['name']}] syncing language: {lang}")
        
            with ThreadPoolExecutor(max_workers=2) as executor:
                products_future = executor.submit(fetch_products, lang, api_key, api_secret)
                variants_future = executor.submit(fetch_variants, lang, api_key, api_secret)
            
                localized_products = products_future.result()
                localized_variants = variants_future.result()

            # Filter to only include products/variants that exist in DB
            localized_product_rows = [
                {
                    "shop_id": shop["id"],
                    "lightspeed_product_id": p["id"],
                    "language_code": lang,
                    "url": p.get("url"),
                    "title": p.get("title"),
                    "fulltitle": p.get("fulltitle"),
                    "description": p.get("description"),
                    "content": p.get("content"),
                }
                for p in localized_products
                if p["id"] in valid_product_ids  # Only sync content for valid products
            ]

            localized_variant_rows = [
                {
                    "shop_id": shop["id"],
                    "lightspeed_variant_id": v["id"],
                    "language_code": lang,
                    "title": v.get("title"),
                }
                for v in localized_variants
                if v["id"] in valid_variant_ids  # Only sync content for valid variants
            ]
            
            # Log filtered items (products/variants not in base language)
            filtered_products = len(localized_products) - len(localized_product_rows)
            filtered_variants = len(localized_variants) - len(localized_variant_rows)
        
            if filtered_products > 0:
                print(f"      ⚠️  {shop['name']} Filtered {filtered_products} product(s) not in base language")
            if filtered_variants > 0:
                print(f"      ⚠️  {shop['name']} Filtered {filtered_variants} variant(s) not in base language")

            bulk_upsert(supabase, "product_content", localized_product_rows, "shop_id,lightspeed_product_id,language_code")
            bulk_upsert(supabase, "variant_content", localized_variant_rows, "shop_id,lightspeed_variant_id,language_code")
        
        # Update sync log with success
        supabase.table("sync_logs").update({
            "status": "success",
            "completed_at": "now()",
            **metrics
        }).eq("id", log_id).execute()
        
    except Exception as e:
        # Update sync log with error
        supabase.table("sync_logs").update({
            "status": "error",
            "completed_at": "now()",
            "error_message": str(e),
            **metrics
        }).eq("id", log_id).execute()
        raise


# =====================================================
# ENTRY POINT – ALL SHOPS (PARALLEL)
# =====================================================
if __name__ == "__main__":
    start = time.time()

    # Create initial client to fetch shops list
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    shops = (
        supabase.table("shops")
        .select("id,name,tld,shop_languages(code,is_active,is_default)")
        .execute()
        .data
    )

    # Run all shops in parallel
    with ThreadPoolExecutor(max_workers=len(shops)) as executor:
        futures = {executor.submit(sync_shop, shop): shop for shop in shops}
        
        for future in as_completed(futures):
            shop = futures[future]
            try:
                future.result()  # This will raise any exceptions that occurred
            except Exception as e:
                print(f"❌ Error syncing shop {shop['name']}: {e}")

    total = time.time() - start

    print("\n" + "=" * 60)
    print("SYNC COMPLETE (ALL SHOPS)")
    print(f"Total runtime: {total:.2f}s")
    print("=" * 60)
