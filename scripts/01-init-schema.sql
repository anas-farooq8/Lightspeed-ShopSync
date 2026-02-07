-- =====================================================
-- INIT SCHEMA (Run first: 01-init-schema.sql)
-- =====================================================
--
-- Creates: extensions, tables, indexes, RLS policies, triggers
-- Tables: shops, shop_languages, products, product_content,
--         variants, variant_content, sync_logs
-- =====================================================

-- =========================
-- EXTENSIONS
-- =========================
create extension if not exists "pgcrypto";


-- =========================
-- SHOPS
-- =========================
create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  store_number integer not null unique,
  base_url text not null unique,
  role text not null check (role in ('source', 'target')),
  tld text not null,  -- nl / de / be
  created_at timestamp with time zone default now()
);

-- RLS: Shops
alter table shops enable row level security;

create policy "Authenticated users can read shops"
  on shops for select
  to authenticated
  using ((select auth.uid()) is not null);


-- =========================
-- SHOP LANGUAGES
-- =========================
create table shop_languages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  code text not null,              -- nl / fr / de
  is_active boolean not null,
  is_default boolean not null,
  created_at timestamp with time zone default now(),
  unique (shop_id, code)
);

-- RLS: Shop Languages
alter table shop_languages enable row level security;

create policy "Authenticated users can read shop languages"
  on shop_languages for select
  to authenticated
  using ((select auth.uid()) is not null);


-- =========================
-- PRODUCTS (LANGUAGE-AGNOSTIC)
-- =========================
create table products (
  shop_id uuid not null references shops(id) on delete cascade,
  lightspeed_product_id bigint not null,

  visibility text,
  image jsonb, -- default variant image {src, thumb, title}

  -- Lightspeed timestamps
  ls_created_at timestamp with time zone not null,
  ls_updated_at timestamp with time zone not null,

  updated_at timestamp with time zone default now(),

  primary key (shop_id, lightspeed_product_id)
);

-- For sorting by creation date (used in sync operations RPC)
create index idx_products_created_at on products (ls_created_at DESC);

-- RLS: Products
-- Note: All authenticated users are manually-created admins with full access
alter table products enable row level security;

create policy "Authenticated users can read products"
  on products for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Authenticated users can insert products"
  on products for insert
  to authenticated
  with check ((select auth.uid()) is not null);

create policy "Authenticated users can update products"
  on products for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);


-- =========================
-- PRODUCT CONTENT (LANGUAGE-SPECIFIC)
-- =========================
create table product_content (
  shop_id uuid not null,
  lightspeed_product_id bigint not null,
  language_code text not null, -- nl / fr / de

  url text,
  title text,
  fulltitle text,
  description text,
  content text,

  updated_at timestamp with time zone default now(),

  primary key (shop_id, lightspeed_product_id, language_code),
  foreign key (shop_id, lightspeed_product_id) references products(shop_id, lightspeed_product_id) on delete cascade
);

-- RLS: Product Content
-- Note: All authenticated users are manually-created admins with full access
alter table product_content enable row level security;

create policy "Authenticated users can read product content"
  on product_content for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Authenticated users can insert product content"
  on product_content for insert
  to authenticated
  with check ((select auth.uid()) is not null);

create policy "Authenticated users can update product content"
  on product_content for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);


-- =========================
-- VARIANTS (SKU MATCHING CORE)
-- =========================
create table variants (
  shop_id uuid not null,
  lightspeed_variant_id bigint not null,
  lightspeed_product_id bigint not null,

  sku text not null,
  is_default boolean,
  sort_order integer,  -- display order from Lightspeed API
  price_excl numeric,
  image jsonb, -- {src, thumb, title}

  updated_at timestamp with time zone default now(),

  primary key (shop_id, lightspeed_variant_id),
  foreign key (shop_id, lightspeed_product_id) references products(shop_id, lightspeed_product_id) on delete cascade
);

-- =====================================================
-- PERFORMANCE-CRITICAL INDEXES FOR VARIANTS
-- =====================================================
-- These indexes are essential for view and RPC performance
-- 1. Composite index for shop + default + SKU lookups
create index idx_variants_shop_default_sku on variants (shop_id, is_default, sku);
-- 2. FUNCTIONAL INDEX on trimmed SKU (eliminates runtime TRIM())
-- This is critical for matching performance as it allows index-only scans
create index idx_variants_trimmed_sku on variants (TRIM(sku));
-- 3. FUNCTIONAL INDEX on trimmed SKU for default variants only
-- Most important for CREATE/EDIT operations
create index idx_variants_trimmed_sku_default on variants (TRIM(sku)) where is_default = true;
-- 4. Product-level index (for variant counting)
create index idx_variants_product on variants (shop_id, lightspeed_product_id);

-- RLS: Variants
-- Note: All authenticated users are manually-created admins with full access
alter table variants enable row level security;

create policy "Authenticated users can read variants"
  on variants for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Authenticated users can insert variants"
  on variants for insert
  to authenticated
  with check ((select auth.uid()) is not null);

create policy "Authenticated users can update variants"
  on variants for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);


-- =========================
-- VARIANT CONTENT (LANGUAGE-SPECIFIC)
-- =========================
create table variant_content (
  shop_id uuid not null,
  lightspeed_variant_id bigint not null,
  language_code text not null, -- nl / fr / de

  title text,

  updated_at timestamp with time zone default now(),

  primary key (shop_id, lightspeed_variant_id, language_code),
  foreign key (shop_id, lightspeed_variant_id) references variants(shop_id, lightspeed_variant_id) on delete cascade
);

-- RLS: Variant Content
-- Note: All authenticated users are manually-created admins with full access
alter table variant_content enable row level security;

create policy "Authenticated users can read variant content"
  on variant_content for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Authenticated users can insert variant content"
  on variant_content for insert
  to authenticated
  with check ((select auth.uid()) is not null);

create policy "Authenticated users can update variant content"
  on variant_content for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);


-- =========================
-- SYNC LOGS
-- =========================
-- Status enum for sync operations
create type sync_status as enum ('running', 'success', 'error');

-- Sync logs table to track all sync operations
create table sync_logs (
    id bigserial primary key,
    shop_id uuid not null references shops(id) on delete cascade,
    
    -- Timing
    started_at timestamp with time zone not null default now(),
    completed_at timestamp with time zone,
    duration_seconds numeric(10,2),
    
    -- Status
    status sync_status not null default 'running',
    error_message text,
    
    -- Metrics: API fetch counts
    products_fetched integer default 0,
    variants_fetched integer default 0,
    
    -- Metrics: DB operation counts
    products_synced integer default 0,
    variants_synced integer default 0,
    products_deleted integer default 0,
    variants_deleted integer default 0,
    variants_filtered integer default 0,  -- Orphaned variants filtered out
    
    -- Standard timestamps
    created_at timestamp with time zone not null default now(),
);

-- Indexes
-- For general date-based queries
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);
-- For shop-specific queries
CREATE INDEX idx_sync_logs_shop_started ON sync_logs(shop_id, started_at DESC);
-- For the GROUP BY DATE query (critical for performance)
CREATE INDEX idx_sync_logs_started_date ON sync_logs(DATE(started_at) DESC);
-- For combined shop + status filters
CREATE INDEX idx_sync_logs_shop_status_started ON sync_logs(shop_id, status, started_at DESC);

-- Auto-calculate duration when completed_at is set
create or replace function calculate_sync_duration()
returns trigger
security definer
set search_path = public, pg_temp
language plpgsql
as $$
begin
    if new.completed_at is not null and old.completed_at is null then
        new.duration_seconds := extract(epoch from (new.completed_at - new.started_at));
    end if;
    return new;
end;
$$;

create trigger set_sync_duration
before update on sync_logs
for each row
when (new.completed_at is not null and old.completed_at is null)
execute function calculate_sync_duration();

-- RLS: Sync Logs
alter table sync_logs enable row level security;

create policy "Authenticated users can read sync logs"
  on sync_logs for select
  to authenticated
  using ((select auth.uid()) is not null);


-- =========================
-- UPDATED_AT TRIGGER FUNCTION
-- =========================
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =========================
-- TRIGGERS
-- =========================
create trigger trg_products_updated
before update on products
for each row execute function set_updated_at();

create trigger trg_product_content_updated
before update on product_content
for each row execute function set_updated_at();

create trigger trg_variants_updated
before update on variants
for each row execute function set_updated_at();

create trigger trg_variant_content_updated
before update on variant_content
for each row execute function set_updated_at();
