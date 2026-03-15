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

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing required environment variables: SUPABASE_URL or SUPABASE_KEY")

LIMIT = 250
API_TIMEOUT = 30
MAX_RETRIES = 3
DB_BATCH_SIZE = 1000  # Supabase pagination batch size

PRODUCT_FIELDS = "id,visibility,url,title,fulltitle,description,content,image,images,createdAt,updatedAt"
VARIANT_FIELDS = "id,isDefault,sortOrder,sku,priceExcl,title,image,product"

# =====================================================
# API HELPERS
# =====================================================
def normalize_image(img):
    """Normalize image dict to contain only title, thumb, src. Returns None if no valid image."""
    if not isinstance(img, dict):
        return None
    
    title, thumb, src = img.get("title"), img.get("thumb"), img.get("src")
    return {"title": title, "thumb": thumb, "src": src} if any([title, thumb, src]) else None


def extract_images_link(images):
    """Extract images API link from images field. Returns link string or None."""
    if not images or not isinstance(images, dict):
        return None
    resource = images.get("resource")
    if not resource or not isinstance(resource, dict):
        return None
    link = resource.get("link")
    return link if isinstance(link, str) and link.strip() else None


def fetch_api_with_pagination(url, resource_key, fields, lang, api_key, api_secret, normalize_func=None):
    """Generic function to fetch API resources with pagination and retry logic."""
    items, page = [], 1
    full_url = f"https://api.webshopapp.com/{lang}/{url}.json"

    while True:
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.get(
                    full_url,
                    params={"limit": LIMIT, "page": page, "fields": fields},
                    auth=(api_key, api_secret),
                    timeout=API_TIMEOUT,
                )
                r.raise_for_status()
                break
            except requests.exceptions.Timeout as e:
                if attempt == MAX_RETRIES - 1:
                    raise RuntimeError(f"Timeout fetching {url} (page {page}) after {MAX_RETRIES} attempts") from e
                wait_time = 2 ** attempt
                print(f"   ⚠️  Timeout on page {page}, retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s")
                time.sleep(wait_time)
            except requests.exceptions.RequestException as e:
                if attempt == MAX_RETRIES - 1:
                    raise RuntimeError(f"Failed to fetch {url} (page {page}): {e}") from e
                wait_time = 2 ** attempt
                print(f"   ⚠️  Error on page {page}, retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s: {e}")
                time.sleep(wait_time)

        batch = r.json().get(resource_key, [])
        if not batch:
            break

        if normalize_func:
            for item in batch:
                item["image"] = normalize_func(item.get("image"))

        items.extend(batch)
        if len(batch) < LIMIT:
            break
        page += 1

    return items


def fetch_products(lang, api_key, api_secret):
    """Fetch all products from Lightspeed API."""
    return fetch_api_with_pagination("products", "products", PRODUCT_FIELDS, lang, api_key, api_secret, normalize_image)


def fetch_variants(lang, api_key, api_secret):
    """Fetch all variants from Lightspeed API."""
    return fetch_api_with_pagination("variants", "variants", VARIANT_FIELDS, lang, api_key, api_secret, normalize_image)


def attach_variants(products, variants, shop_name=None):
    """Attach variants to their corresponding products."""
    by_product = defaultdict(list)
    orphaned_variants = []

    for v in variants:
        pid = v.get("product", {}).get("resource", {}).get("id")
        if pid:
            v.pop("product", None)
            by_product[pid].append(v)

    product_ids = {p["id"] for p in products}
    
    for p in products:
        p["variants"] = by_product.get(p["id"], [])
    
    # Check for orphaned variants
    for pid, variants_list in by_product.items():
        if pid not in product_ids:
            orphaned_variants.extend(variants_list)
            shop_prefix = f"[{shop_name}] " if shop_name else ""
            print(f"   ⚠️  {shop_prefix}{len(variants_list)} variant(s) reference non-existent product ID {pid} & variant IDs {[v['id'] for v in variants_list]} (skipped)")

    return products, orphaned_variants


# =====================================================
# DB HELPERS
# =====================================================
def fetch_db_table_paginated(supabase_url, supabase_key, table, select_fields, shop_id):
    """
    Fetch all rows from a table with pagination.
    Creates own Supabase client for thread-safety.
    Ensures no data is missed by paginating until batch < DB_BATCH_SIZE.
    """
    supabase = create_client(supabase_url, supabase_key)
    all_rows, start = [], 0
    
    while True:
        try:
            batch = (
                supabase.table(table)
                .select(select_fields)
                .eq("shop_id", shop_id)
                .range(start, start + DB_BATCH_SIZE - 1)
                .execute()
                .data
            )
            
            if not batch:
                break
                
            all_rows.extend(batch)
            
            # If we got less than DB_BATCH_SIZE rows, we've reached the end
            if len(batch) < DB_BATCH_SIZE:
                break
                
            start += DB_BATCH_SIZE
            
        except Exception as e:
            raise RuntimeError(f"Failed to fetch from {table} at offset {start}: {e}") from e
    
    return all_rows


def bulk_upsert(supabase, table, rows, conflict_cols):
    """Upsert rows to database table."""
    if not rows:
        return
    try:
        supabase.table(table).upsert(rows, on_conflict=conflict_cols).execute()
    except Exception as e:
        print(f"   ❌ Failed to upsert {len(rows)} rows to {table}: {e}")
        raise


def normalize_for_comparison(value):
    """Normalize values for comparison (handle None, False, empty strings)."""
    if value is None or value is False or (isinstance(value, str) and not value.strip()):
        return None
    return value


def images_equal(img1, img2):
    """Compare two image objects/values."""
    norm1 = normalize_for_comparison(img1)
    norm2 = normalize_for_comparison(img2)
    
    if norm1 is None and norm2 is None:
        return True
    if (norm1 is None) != (norm2 is None):
        return False
    if isinstance(norm1, dict) and isinstance(norm2, dict):
        return (norm1.get("src") == norm2.get("src") and
                norm1.get("thumb") == norm2.get("thumb") and
                norm1.get("title") == norm2.get("title"))
    return norm1 == norm2


def fetch_existing_data_for_comparison(shop_id):
    """
    Fetch all existing data from DB for source shop comparison.
    Uses parallel threads, each with its own Supabase client (thread-safe).
    """
    with ThreadPoolExecutor(max_workers=4) as executor:
        products_future = executor.submit(
            fetch_db_table_paginated,
            SUPABASE_URL, SUPABASE_KEY, "products", 
            "lightspeed_product_id,visibility,image,ls_updated_at",
            shop_id
        )
        content_future = executor.submit(
            fetch_db_table_paginated,
            SUPABASE_URL, SUPABASE_KEY, "product_content",
            "lightspeed_product_id,language_code,title,fulltitle,description,content",
            shop_id
        )
        variants_future = executor.submit(
            fetch_db_table_paginated,
            SUPABASE_URL, SUPABASE_KEY, "variants",
            "lightspeed_variant_id,lightspeed_product_id,is_default,sort_order,price_excl,image",
            shop_id
        )
        variant_content_future = executor.submit(
            fetch_db_table_paginated,
            SUPABASE_URL, SUPABASE_KEY, "variant_content",
            "lightspeed_variant_id,language_code,title",
            shop_id
        )
        
        # Block until all fetches complete
        return {
            "products": products_future.result(),
            "product_content": content_future.result(),
            "variants": variants_future.result(),
            "variant_content": variant_content_future.result()
        }


def fetch_existing_data_for_cleanup(shop_id):
    """
    Fetch only IDs from DB for target shop cleanup.
    Uses parallel threads, each with its own Supabase client (thread-safe).
    """
    with ThreadPoolExecutor(max_workers=2) as executor:
        products_future = executor.submit(
            fetch_db_table_paginated,
            SUPABASE_URL, SUPABASE_KEY, "products", 
            "lightspeed_product_id",
            shop_id
        )
        variants_future = executor.submit(
            fetch_db_table_paginated,
            SUPABASE_URL, SUPABASE_KEY, "variants",
            "lightspeed_variant_id",
            shop_id
        )
        
        # Block until all fetches complete
        return {
            "products": products_future.result(),
            "variants": variants_future.result()
        }


def compare_product_changes(product_row, existing_products, existing_product_content, existing_variants, 
                           existing_variants_by_product, existing_variant_content, content_by_product, 
                           variants_by_product, variant_content_by_variant):
    """
    Compare a product with its existing data to detect monitored field changes.
    Returns (has_changes: bool, change_reasons: list).
    Uses early return for performance.
    """
    ls_product_id = product_row["lightspeed_product_id"]
    existing_product = existing_products.get(ls_product_id)
    
    # If product doesn't exist in DB, it's new - keep new ls_updated_at
    if not existing_product:
        return False, []
    
    # 1. Product-level fields
    if product_row["visibility"] != existing_product["visibility"]:
        return True, [f"visibility: {existing_product['visibility']} → {product_row['visibility']}"]
    
    if not images_equal(product_row["image"], existing_product["image"]):
        return True, ["image changed"]
    
    # 2. Product content fields (all active languages)
    for content_row in content_by_product[ls_product_id]:
        lang = content_row["language_code"]
        key = (ls_product_id, lang)
        existing_content = existing_product_content.get(key)
        
        if not existing_content:
            return True, [f"new language content: {lang}"]
        
        # Compare content fields
        for field in ["title", "fulltitle", "description", "content"]:
            new_val = normalize_for_comparison(content_row.get(field))
            old_val = normalize_for_comparison(existing_content.get(field))
            if new_val != old_val:
                return True, [f"{field}[{lang}] changed"]
    
    # 3. Variant count
    new_variants = variants_by_product[ls_product_id]
    old_variants = existing_variants_by_product.get(ls_product_id, [])
    if len(new_variants) != len(old_variants):
        return True, [f"variant count: {len(old_variants)} → {len(new_variants)}"]
    
    # 4. Variant fields (for each variant)
    for variant_row in new_variants:
        ls_variant_id = variant_row["lightspeed_variant_id"]
        existing_variant = existing_variants.get(ls_variant_id)
        
        if not existing_variant:
            return True, [f"new variant: {ls_variant_id}"]
        
        # Compare variant fields
        if variant_row["is_default"] != existing_variant["is_default"]:
            return True, [f"variant {ls_variant_id} isDefault changed"]
        
        if variant_row["sort_order"] != existing_variant["sort_order"]:
            return True, [f"variant {ls_variant_id} sortOrder changed"]
        
        # Compare price
        new_price = variant_row["price_excl"]
        old_price = existing_variant["price_excl"]
        if new_price != old_price:
            try:
                if float(new_price or 0) != float(old_price or 0):
                    return True, [f"variant {ls_variant_id} priceExcl changed"]
            except (ValueError, TypeError):
                return True, [f"variant {ls_variant_id} priceExcl changed"]
        
        if not images_equal(variant_row["image"], existing_variant["image"]):
            return True, [f"variant {ls_variant_id} image changed"]
        
        # 5. Variant content (all active languages)
        for variant_content_row in variant_content_by_variant[ls_variant_id]:
            lang = variant_content_row["language_code"]
            key = (ls_variant_id, lang)
            existing_vc = existing_variant_content.get(key)
            
            if not existing_vc:
                return True, [f"new variant content: variant {ls_variant_id}, lang {lang}"]
            
            new_title = normalize_for_comparison(variant_content_row.get("title"))
            old_title = normalize_for_comparison(existing_vc.get("title"))
            if new_title != old_title:
                return True, [f"variant {ls_variant_id} title[{lang}] changed"]
    
    return False, []


# =====================================================
# SYNC ONE SHOP
# =====================================================
def sync_shop(shop):
    """
    Sync a single shop. Creates own Supabase client for thread-safety.
    This function is called in parallel by multiple threads.
    """
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print(f"🔄 Syncing shop: {shop['name']} ({shop['role'].upper()})")
    
    # Create sync log entry
    log_result = supabase.table("sync_logs").insert({
        "shop_id": shop["id"],
        "status": "running"
    }).execute()
    log_id = log_result.data[0]["id"]
    
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
        # Get API credentials
        tld = shop["tld"].upper()
        api_key = os.getenv(f"LIGHTSPEED_API_KEY_{tld}")
        api_secret = os.getenv(f"LIGHTSPEED_API_SECRET_{tld}")

        if not api_key or not api_secret:
            raise RuntimeError(f"Missing API credentials for shop TLD={tld}")

        languages = shop["shop_languages"]
        base_lang = next(l["code"] for l in languages if l["is_default"])
        active_langs = [l["code"] for l in languages if l["is_active"]]

        # -------------------------------------------------
        # FETCH API DATA FOR ALL LANGUAGES IN PARALLEL
        # -------------------------------------------------
        print(f"   🌍 [{shop['name']}] Fetching data for languages: {', '.join(active_langs)}")
        
        # Fetch base language
        with ThreadPoolExecutor(max_workers=2) as executor:
            products_future = executor.submit(fetch_products, base_lang, api_key, api_secret)
            variants_future = executor.submit(fetch_variants, base_lang, api_key, api_secret)
            products = products_future.result()
            variants = variants_future.result()
    
        metrics["products_fetched"] = len(products)
        metrics["variants_fetched"] = len(variants)
        print(f"   📊 [{shop['name']}] Fetched {len(products)} products, {len(variants)} variants from API")
    
        products, orphaned_from_api = attach_variants(products, variants, shop['name'])
        metrics["variants_filtered"] = len(orphaned_from_api)

        # Fetch secondary languages
        localized_data = {}
        secondary_langs = [lang for lang in active_langs if lang != base_lang]
        
        if secondary_langs:
            with ThreadPoolExecutor(max_workers=len(secondary_langs) * 2) as executor:
                futures = {}
                for lang in secondary_langs:
                    p_future = executor.submit(fetch_products, lang, api_key, api_secret)
                    v_future = executor.submit(fetch_variants, lang, api_key, api_secret)
                    futures[lang] = (p_future, v_future)
                
                for lang, (p_future, v_future) in futures.items():
                    localized_data[lang] = (p_future.result(), v_future.result())
                    print(f"      ↳ [{shop['name']}] Fetched {len(localized_data[lang][0])} products, {len(localized_data[lang][1])} variants for {lang}")

        # -------------------------------------------------
        # BUILD DATA ROWS FOR ALL LANGUAGES
        # -------------------------------------------------
        product_rows = []
        content_rows = []
        variant_rows = []
        variant_content_rows = []
        variant_ids_seen = set()
        api_product_ids = {p["id"] for p in products}

        for p in products:
            product_rows.append({
                "shop_id": shop["id"],
                "lightspeed_product_id": p["id"],
                "visibility": p.get("visibility"),
                "image": p.get("image"),
                "images_link": extract_images_link(p.get("images")),
                "ls_created_at": p.get("createdAt"),
                "ls_updated_at": p.get("updatedAt"),
            })

            # Base language content
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

            # Variants
            for v in p["variants"]:
                variant_id = v["id"]
                if variant_id not in variant_ids_seen:
                    variant_rows.append({
                        "shop_id": shop["id"],
                        "lightspeed_product_id": p["id"],
                        "lightspeed_variant_id": variant_id,
                        "sku": v["sku"],
                        "is_default": v.get("isDefault"),
                        "sort_order": v.get("sortOrder"),
                        "price_excl": v.get("priceExcl"),
                        "image": v.get("image"),
                    })
                    variant_ids_seen.add(variant_id)

                    # Base language variant content
                    variant_content_rows.append({
                        "shop_id": shop["id"],
                        "lightspeed_variant_id": variant_id,
                        "language_code": base_lang,
                        "title": v.get("title"),
                    })

        # Add secondary language content
        for lang, (localized_products, localized_variants) in localized_data.items():
            for p in localized_products:
                if p["id"] in api_product_ids:
                    content_rows.append({
                        "shop_id": shop["id"],
                        "lightspeed_product_id": p["id"],
                        "language_code": lang,
                        "url": p.get("url"),
                        "title": p.get("title"),
                        "fulltitle": p.get("fulltitle"),
                        "description": p.get("description"),
                        "content": p.get("content"),
                    })
            
            for v in localized_variants:
                if v["id"] in variant_ids_seen:
                    variant_content_rows.append({
                        "shop_id": shop["id"],
                        "lightspeed_variant_id": v["id"],
                        "language_code": lang,
                        "title": v.get("title"),
                    })

        print(f"   📊 [{shop['name']}] Built {len(product_rows)} products, {len(variant_rows)} variants to upsert")
        metrics["products_synced"] = len(product_rows)
        metrics["variants_synced"] = len(variant_rows)
        
        api_variant_ids = {v["lightspeed_variant_id"] for v in variant_rows}
    
        # -------------------------------------------------
        # SMART UPDATE: ROLE-BASED LOGIC
        # -------------------------------------------------
        if shop["role"] == "source":
            # SOURCE shop: Compare monitored fields and preserve ls_updated_at if unchanged
            print(f"   🔍 [{shop['name']}] SOURCE shop - comparing monitored fields")
            
            existing_data = fetch_existing_data_for_comparison(shop["id"])
            print(f"   📊 [{shop['name']}] DB has {len(existing_data['products'])} products, {len(existing_data['variants'])} variants")
            
            # Index existing data (thread-safe - no shared mutable state)
            existing_products = {p["lightspeed_product_id"]: p for p in existing_data["products"]}
            existing_product_content = {(pc["lightspeed_product_id"], pc["language_code"]): pc for pc in existing_data["product_content"]}
            existing_variants = {v["lightspeed_variant_id"]: v for v in existing_data["variants"]}
            existing_variants_by_product = defaultdict(list)
            for v in existing_data["variants"]:
                existing_variants_by_product[v["lightspeed_product_id"]].append(v)
            existing_variant_content = {(vc["lightspeed_variant_id"], vc["language_code"]): vc for vc in existing_data["variant_content"]}
            
            # Group new data for comparison
            content_by_product = defaultdict(list)
            for content_row in content_rows:
                content_by_product[content_row["lightspeed_product_id"]].append(content_row)
            
            variant_content_by_variant = defaultdict(list)
            for vc_row in variant_content_rows:
                variant_content_by_variant[vc_row["lightspeed_variant_id"]].append(vc_row)
            
            variants_by_product = defaultdict(list)
            for variant_row in variant_rows:
                variants_by_product[variant_row["lightspeed_product_id"]].append(variant_row)
            
            # Compare and preserve ls_updated_at
            products_unchanged = 0
            products_changed = 0
            
            for product_row in product_rows:
                has_changes, change_reasons = compare_product_changes(
                    product_row, existing_products, existing_product_content, existing_variants,
                    existing_variants_by_product, existing_variant_content, content_by_product,
                    variants_by_product, variant_content_by_variant
                )
                
                if has_changes:
                    products_changed += 1
                    if products_changed <= 10:
                        print(f"   🔄 [{shop['name']}] Product {product_row['lightspeed_product_id']}: {', '.join(change_reasons[:2])}")
                else:
                    # Preserve old ls_updated_at
                    existing_product = existing_products.get(product_row["lightspeed_product_id"])
                    if existing_product:
                        product_row["ls_updated_at"] = existing_product["ls_updated_at"]
                        products_unchanged += 1
            
            if products_unchanged > 0:
                print(f"   ⏸️  [{shop['name']}] {products_unchanged} product(s) unchanged (preserved ls_updated_at)")
            if products_changed > 0:
                print(f"   🔄 [{shop['name']}] {products_changed} product(s) changed (updated ls_updated_at)")
        
        else:
            # TARGET shop: Use API ls_updated_at directly (no comparison)
            existing_data = fetch_existing_data_for_cleanup(shop["id"])
            existing_products = {p["lightspeed_product_id"]: p for p in existing_data["products"]}
            existing_variants = {v["lightspeed_variant_id"]: v for v in existing_data["variants"]}
    
        # -------------------------------------------------
        # UPSERT TO DATABASE
        # -------------------------------------------------
        bulk_upsert(supabase, "products", product_rows, "shop_id,lightspeed_product_id")
        bulk_upsert(supabase, "product_content", content_rows, "shop_id,lightspeed_product_id,language_code")
        bulk_upsert(supabase, "variants", variant_rows, "shop_id,lightspeed_variant_id")
        bulk_upsert(supabase, "variant_content", variant_content_rows, "shop_id,lightspeed_variant_id,language_code")

        # -------------------------------------------------
        # CLEANUP: DELETE ORPHANED DATA
        # -------------------------------------------------
        existing_product_ids = set(existing_products.keys())
        orphaned_products = existing_product_ids - api_product_ids

        if orphaned_products:
            supabase.table("products").delete() \
                .eq("shop_id", shop["id"]) \
                .in_("lightspeed_product_id", list(orphaned_products)) \
                .execute()
            metrics["products_deleted"] = len(orphaned_products)
            print(f"   🗑️  [{shop['name']}] Deleted {len(orphaned_products)} orphaned products")

        existing_variant_ids = set(existing_variants.keys())
        orphaned_variants = existing_variant_ids - api_variant_ids

        if orphaned_variants:
            supabase.table("variants").delete() \
                .eq("shop_id", shop["id"]) \
                .in_("lightspeed_variant_id", list(orphaned_variants)) \
                .execute()
            metrics["variants_deleted"] = len(orphaned_variants)
            print(f"   🗑️  [{shop['name']}] Deleted {len(orphaned_variants)} orphaned variants")
        
        # Update sync log with success
        supabase.table("sync_logs").update({
            "status": "success",
            "completed_at": "now()",
            **metrics
        }).eq("id", log_id).execute()
        
    except Exception as e:
        error_msg = str(e)
        print(f"   ❌ [{shop['name']}] Error: {error_msg}")
        
        try:
            supabase.table("sync_logs").update({
                "status": "error",
                "completed_at": "now()",
                "error_message": error_msg,
                **metrics
            }).eq("id", log_id).execute()
        except Exception as log_error:
            print(f"   ❌ [{shop['name']}] Failed to update sync log: {log_error}")
        
        raise


# =====================================================
# ENTRY POINT – ALL SHOPS (PARALLEL)
# =====================================================
if __name__ == "__main__":
    start = time.time()

    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        shops = (
            supabase.table("shops")
            .select("id,name,tld,role,shop_languages(code,is_active,is_default)")
            .execute()
            .data
        )
        
        if not shops:
            print("⚠️  No shops found in database")
            exit(0)
        
        print(f"📋 Found {len(shops)} shop(s) to sync\n")

        success_count = 0
        error_count = 0
        
        with ThreadPoolExecutor(max_workers=len(shops)) as executor:
            futures = {executor.submit(sync_shop, shop): shop for shop in shops}
            
            for future in as_completed(futures):
                shop = futures[future]
                try:
                    future.result()
                    success_count += 1
                except Exception as e:
                    error_count += 1
                    print(f"❌ Error syncing shop {shop['name']}: {e}")

        total = time.time() - start

        print("\n" + "=" * 60)
        print("SYNC COMPLETE (ALL SHOPS)")
        print(f"Total runtime: {total:.2f}s")
        print(f"Success: {success_count}, Errors: {error_count}")
        print("=" * 60)
        
        exit(1 if error_count > 0 else 0)
        
    except KeyboardInterrupt:
        print("\n⚠️  Sync interrupted by user")
        exit(130)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        exit(1)
