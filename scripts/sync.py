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

# Validate required environment variables
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
    
    # Extract the fields
    title = img.get("title")
    thumb = img.get("thumb")
    src = img.get("src")
    
    # If all fields are None/empty, return None instead of a dict
    if not any([title, thumb, src]):
        return None
    
    return {
        "title": title,
        "thumb": thumb,
        "src": src,
    }


def extract_images_link(images):
    """Extract images API link from images field. Returns link string or None."""
    if not images or not isinstance(images, dict):
        return None
    resource = images.get("resource")
    if not resource or not isinstance(resource, dict):
        return None
    link = resource.get("link")
    return link if isinstance(link, str) and link.strip() else None


def fetch_products(lang, api_key, api_secret):
    """Fetch all products from Lightspeed API with pagination and retry logic."""
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
            except requests.exceptions.Timeout as e:
                if attempt == MAX_RETRIES - 1:
                    raise RuntimeError(f"Timeout fetching products (page {page}) after {MAX_RETRIES} attempts") from e
                wait_time = 2 ** attempt
                print(f"   ⚠️  Timeout on page {page}, retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s")
                time.sleep(wait_time)
            except requests.exceptions.RequestException as e:
                if attempt == MAX_RETRIES - 1:
                    raise RuntimeError(f"Failed to fetch products (page {page}): {e}") from e
                wait_time = 2 ** attempt
                print(f"   ⚠️  Error on page {page}, retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s: {e}")
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
    """Fetch all variants from Lightspeed API with pagination and retry logic."""
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
            except requests.exceptions.Timeout as e:
                if attempt == MAX_RETRIES - 1:
                    raise RuntimeError(f"Timeout fetching variants (page {page}) after {MAX_RETRIES} attempts") from e
                wait_time = 2 ** attempt
                print(f"   ⚠️  Timeout on page {page}, retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s")
                time.sleep(wait_time)
            except requests.exceptions.RequestException as e:
                if attempt == MAX_RETRIES - 1:
                    raise RuntimeError(f"Failed to fetch variants (page {page}): {e}") from e
                wait_time = 2 ** attempt
                print(f"   ⚠️  Error on page {page}, retry {attempt + 1}/{MAX_RETRIES} after {wait_time}s: {e}")
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
    orphaned_variants = []  # Track variants with no matching product

    for v in variants:
        pid = v.get("product", {}).get("resource", {}).get("id")
        if pid:
            v.pop("product", None)
            by_product[pid].append(v)

    product_ids = {p["id"] for p in products}
    
    for p in products:
        p["variants"] = by_product.get(p["id"], [])
    
    # Check for variants attached to non-existent products and filter them out
    for pid, variants_list in by_product.items():
        if pid not in product_ids:
            shop_prefix = f"[{shop_name}] " if shop_name else ""
            orphaned_variants.extend(variants_list)
            print(f"   ⚠️  {shop_prefix}{len(variants_list)} variant(s) reference non-existent product ID {pid} & variant IDs {[v['id'] for v in variants_list]} (skipped)")

    return products, orphaned_variants


# =====================================================
# DB HELPERS
# =====================================================
def fetch_db_table_paginated(supabase_url, supabase_key, table, select_fields, shop_id):
    """Fetch all rows from a table with pagination. Creates own Supabase client for thread-safety."""
    # Create a new client for this thread to avoid connection reuse issues
    supabase = create_client(supabase_url, supabase_key)
    all_rows = []
    start = 0
    
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
            all_rows.extend(batch)
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
        # FETCH ALL LANGUAGES IN PARALLEL
        # -------------------------------------------------
        print(f"   🌍 [{shop['name']}] Fetching data for languages: {', '.join(active_langs)}")
        
        # Fetch base language products and variants (with full data)
        with ThreadPoolExecutor(max_workers=2) as executor:
            products_future = executor.submit(fetch_products, base_lang, api_key, api_secret)
            variants_future = executor.submit(fetch_variants, base_lang, api_key, api_secret)
        
            products = products_future.result()
            variants = variants_future.result()
    
        metrics["products_fetched"] = len(products)
        metrics["variants_fetched"] = len(variants)
    
        print(f"   📊 [{shop['name']}] Fetched {len(products)} products, {len(variants)} variants from API")
    
        products, orphaned_from_api = attach_variants(products, variants, shop['name'])
        
        # Count filtered variants (orphaned from API)
        metrics["variants_filtered"] = len(orphaned_from_api)

        # Fetch secondary language content in parallel
        localized_data = {}  # {lang: (products, variants)}
        
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
                    print(f"      ↳ Fetched {len(localized_data[lang][0])} products, {len(localized_data[lang][1])} variants for {lang}")

        # -------------------------------------------------
        # BUILD DATA ROWS FOR ALL LANGUAGES
        # -------------------------------------------------
        product_rows = []
        content_rows = []  # Will include ALL languages
        variant_rows = []
        variant_content_rows = []  # Will include ALL languages
        variant_ids_seen = set()  # Track variant IDs to avoid duplicates

        # Get valid product and variant IDs from API
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

            for v in p["variants"]:
                variant_id = v["id"]
                # Only add variant rows once (from base language)
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

                    # Base language variant content (add only once per variant)
                    variant_content_rows.append({
                        "shop_id": shop["id"],
                        "lightspeed_variant_id": variant_id,
                        "language_code": base_lang,
                        "title": v.get("title"),
                    })

        # Add secondary language content
        for lang, (localized_products, localized_variants) in localized_data.items():
            # Product content for this language
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
            
            # Variant content for this language
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
        
        # Build set of API variant IDs for cleanup comparison
        api_variant_ids = {v["lightspeed_variant_id"] for v in variant_rows}
    
        # -------------------------------------------------
        # SMART UPDATE: COMPARE MONITORED FIELDS
        # -------------------------------------------------
        # Fetch existing data from DB for comparison (with pagination, in parallel for speed)
        # Each thread creates its own Supabase client for thread-safety
        with ThreadPoolExecutor(max_workers=4) as executor:
            products_future = executor.submit(
                fetch_db_table_paginated,
                SUPABASE_URL, SUPABASE_KEY, "products", 
                "lightspeed_product_id,visibility,image,ls_updated_at",
                shop["id"]
            )
            
            content_future = executor.submit(
                fetch_db_table_paginated,
                SUPABASE_URL, SUPABASE_KEY, "product_content",
                "lightspeed_product_id,language_code,title,fulltitle,description,content",
                shop["id"]
            )
            
            variants_future = executor.submit(
                fetch_db_table_paginated,
                SUPABASE_URL, SUPABASE_KEY, "variants",
                "lightspeed_variant_id,lightspeed_product_id,is_default,sort_order,price_excl,image",
                shop["id"]
            )
            
            variant_content_future = executor.submit(
                fetch_db_table_paginated,
                SUPABASE_URL, SUPABASE_KEY, "variant_content",
                "lightspeed_variant_id,language_code,title",
                shop["id"]
            )
            
            # Wait for all fetches to complete
            existing_products_list = products_future.result()
            existing_product_content_list = content_future.result()
            existing_variants_list = variants_future.result()
            existing_variant_content_list = variant_content_future.result()
        
        print(f"   📊 [{shop['name']}] DB has {len(existing_products_list)} products, {len(existing_variants_list)} variants, {len(existing_variant_content_list)} variant contents")
        
        # Index existing data for fast lookup
        existing_products = {p["lightspeed_product_id"]: p for p in existing_products_list}
        
        # Index product content by (product_id, language)
        existing_product_content = {}
        for pc in existing_product_content_list:
            key = (pc["lightspeed_product_id"], pc["language_code"])
            existing_product_content[key] = pc
        
        # Index variants by product_id and variant_id
        existing_variants_by_product = defaultdict(list)
        existing_variants = {}
        for v in existing_variants_list:
            existing_variants[v["lightspeed_variant_id"]] = v
            existing_variants_by_product[v["lightspeed_product_id"]].append(v)
        
        # Index variant content by (variant_id, language)
        existing_variant_content = {}
        for vc in existing_variant_content_list:
            key = (vc["lightspeed_variant_id"], vc["language_code"])
            existing_variant_content[key] = vc
        
        # Group new content by product_id for faster lookup
        content_by_product = defaultdict(list)
        for content_row in content_rows:
            content_by_product[content_row["lightspeed_product_id"]].append(content_row)
        
        # Group new variant content by variant_id for faster lookup
        variant_content_by_variant = defaultdict(list)
        for vc_row in variant_content_rows:
            variant_content_by_variant[vc_row["lightspeed_variant_id"]].append(vc_row)
        
        # Group variant rows by product_id for faster lookup
        variants_by_product = defaultdict(list)
        for variant_row in variant_rows:
            variants_by_product[variant_row["lightspeed_product_id"]].append(variant_row)
        
        # Compare and preserve ls_updated_at if monitored fields haven't changed
        products_unchanged = 0
        products_changed = 0
        
        for product_row in product_rows:
            ls_product_id = product_row["lightspeed_product_id"]
            existing_product = existing_products.get(ls_product_id)
            
            # If product doesn't exist in DB, it's new - keep new ls_updated_at
            if not existing_product:
                continue
            
            # Compare monitored fields
            has_changes = False
            change_reasons = []
            
            # 1. Product-level fields
            if product_row["visibility"] != existing_product["visibility"]:
                has_changes = True
                change_reasons.append(f"visibility: {existing_product['visibility']} → {product_row['visibility']}")
            
            if not has_changes and not images_equal(product_row["image"], existing_product["image"]):
                has_changes = True
                change_reasons.append("image changed")
            
            # 2. Product content fields (all active languages)
            if not has_changes:
                for content_row in content_by_product[ls_product_id]:
                    lang = content_row["language_code"]
                    key = (ls_product_id, lang)
                    existing_content = existing_product_content.get(key)
                    
                    if not existing_content:
                        has_changes = True
                        change_reasons.append(f"new language content: {lang}")
                        break
                    
                    # Compare content fields
                    for field in ["title", "fulltitle", "description", "content"]:
                        new_val = normalize_for_comparison(content_row.get(field))
                        old_val = normalize_for_comparison(existing_content.get(field))
                        if new_val != old_val:
                            has_changes = True
                            change_reasons.append(f"{field}[{lang}] changed")
                            break
                    
                    if has_changes:
                        break
            
            # 3. Variant count (added/removed variants)
            if not has_changes:
                new_variants = variants_by_product[ls_product_id]
                old_variants = existing_variants_by_product.get(ls_product_id, [])
                
                if len(new_variants) != len(old_variants):
                    has_changes = True
                    change_reasons.append(f"variant count: {len(old_variants)} → {len(new_variants)}")
            
            # 4. Variant fields (for each variant)
            if not has_changes:
                for variant_row in variants_by_product[ls_product_id]:
                    ls_variant_id = variant_row["lightspeed_variant_id"]
                    existing_variant = existing_variants.get(ls_variant_id)
                    
                    if not existing_variant:
                        has_changes = True
                        change_reasons.append(f"new variant: {ls_variant_id}")
                        break
                    
                    # Compare variant fields
                    if variant_row["is_default"] != existing_variant["is_default"]:
                        has_changes = True
                        change_reasons.append(f"variant {ls_variant_id} isDefault changed")
                        break
                    
                    if variant_row["sort_order"] != existing_variant["sort_order"]:
                        has_changes = True
                        change_reasons.append(f"variant {ls_variant_id} sortOrder changed")
                        break
                    
                    # Compare price (handle None and numeric comparison)
                    new_price = variant_row["price_excl"]
                    old_price = existing_variant["price_excl"]
                    if new_price != old_price:
                        try:
                            if float(new_price or 0) != float(old_price or 0):
                                has_changes = True
                                change_reasons.append(f"variant {ls_variant_id} priceExcl changed")
                                break
                        except (ValueError, TypeError):
                            has_changes = True
                            change_reasons.append(f"variant {ls_variant_id} priceExcl changed")
                            break
                    
                    if not images_equal(variant_row["image"], existing_variant["image"]):
                        has_changes = True
                        change_reasons.append(f"variant {ls_variant_id} image changed")
                        break
                    
                    # 5. Variant content (all active languages)
                    for variant_content_row in variant_content_by_variant[ls_variant_id]:
                        lang = variant_content_row["language_code"]
                        key = (ls_variant_id, lang)
                        existing_vc = existing_variant_content.get(key)
                        
                        if not existing_vc:
                            has_changes = True
                            change_reasons.append(f"new variant content: variant {ls_variant_id}, lang {lang}")
                            break
                        
                        new_title = normalize_for_comparison(variant_content_row.get("title"))
                        old_title = normalize_for_comparison(existing_vc.get("title"))
                        if new_title != old_title:
                            has_changes = True
                            change_reasons.append(f"variant {ls_variant_id} title[{lang}] changed")
                            break
                    
                    if has_changes:
                        break
            
            # Decision: preserve or update ls_updated_at
            if has_changes:
                products_changed += 1
                # Only log first 10 changed products to avoid spam
                if products_changed <= 10:
                    print(f"   🔄 Product {ls_product_id}: {', '.join(change_reasons[:2])}")
            else:
                # No changes in monitored fields - preserve old ls_updated_at
                product_row["ls_updated_at"] = existing_product["ls_updated_at"]
                products_unchanged += 1
        
        if products_unchanged > 0:
            print(f"   ⏸️  [{shop['name']}] {products_unchanged} product(s) unchanged (preserved ls_updated_at)")
        if products_changed > 0:
            print(f"   🔄 [{shop['name']}] {products_changed} product(s) changed (updated ls_updated_at)")
    
        bulk_upsert(supabase, "products", product_rows, "shop_id,lightspeed_product_id")
        bulk_upsert(supabase, "product_content", content_rows, "shop_id,lightspeed_product_id,language_code")
        bulk_upsert(supabase, "variants", variant_rows, "shop_id,lightspeed_variant_id")
        bulk_upsert(supabase, "variant_content", variant_content_rows, "shop_id,lightspeed_variant_id,language_code")

        # -------------------------------------------------
        # CLEANUP: DELETE ORPHANED PRODUCTS & VARIANTS
        # -------------------------------------------------
        # Reuse existing data from comparison step (no extra DB call needed)
        existing_product_ids = set(existing_products.keys())
        orphaned_products = existing_product_ids - api_product_ids

        if orphaned_products:
            supabase.table("products").delete() \
                .eq("shop_id", shop["id"]) \
                .in_("lightspeed_product_id", list(orphaned_products)) \
                .execute()
            metrics["products_deleted"] = len(orphaned_products)
            print(f"   🗑️  Deleted {len(orphaned_products)} orphaned products")

        # Compare API variants vs DB variants (reuse existing data)
        existing_variant_ids = set(existing_variants.keys())
        orphaned_variants = existing_variant_ids - api_variant_ids

        if orphaned_variants:
            supabase.table("variants").delete() \
                .eq("shop_id", shop["id"]) \
                .in_("lightspeed_variant_id", list(orphaned_variants)) \
                .execute()
            metrics["variants_deleted"] = len(orphaned_variants)
            print(f"   🗑️  Deleted {len(orphaned_variants)} orphaned variants")
        
        # Update sync log with success
        supabase.table("sync_logs").update({
            "status": "success",
            "completed_at": "now()",
            **metrics
        }).eq("id", log_id).execute()
        
    except Exception as e:
        # Update sync log with error
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
            print(f"   ❌ Failed to update sync log: {log_error}")
        
        raise


# =====================================================
# ENTRY POINT – ALL SHOPS (PARALLEL)
# =====================================================
if __name__ == "__main__":
    start = time.time()

    try:
        # Create initial client to fetch shops list
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        shops = (
            supabase.table("shops")
            .select("id,name,tld,shop_languages(code,is_active,is_default)")
            .execute()
            .data
        )
        
        if not shops:
            print("⚠️  No shops found in database")
            exit(0)
        
        print(f"📋 Found {len(shops)} shop(s) to sync\n")

        # Run all shops in parallel
        success_count = 0
        error_count = 0
        
        with ThreadPoolExecutor(max_workers=len(shops)) as executor:
            futures = {executor.submit(sync_shop, shop): shop for shop in shops}
            
            for future in as_completed(futures):
                shop = futures[future]
                try:
                    future.result()  # This will raise any exceptions that occurred
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
        
        # Exit with error code if any shop failed
        exit(1 if error_count > 0 else 0)
        
    except KeyboardInterrupt:
        print("\n⚠️  Sync interrupted by user")
        exit(130)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        exit(1)
