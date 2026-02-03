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
  store_number integer not null,
  base_url text not null,
  role text not null check (role in ('source', 'target')),
  tld text not null,  -- nl / de / be
  created_at timestamp with time zone default now()
);

create unique index idx_shops_store_number on shops (store_number);
create index idx_shops_tld on shops (tld);

-- RLS: Shops
alter table shops enable row level security;

create policy "Authenticated users can read shops"
  on shops for select
  to authenticated
  using (true);


-- =========================
-- SHOP LANGUAGES
-- =========================
create table shop_languages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  code text not null,              -- nl / fr / de
  is_active boolean not null,
  is_default boolean not null,
  created_at timestamp with time zone default now()
);

create unique index idx_shop_languages_unique
  on shop_languages (shop_id, code);

-- RLS: Shop Languages
alter table shop_languages enable row level security;

create policy "Authenticated users can read shop languages"
  on shop_languages for select
  to authenticated
  using (true);


-- =========================
-- PRODUCTS (LANGUAGE-AGNOSTIC)
-- =========================
create table products (
  shop_id uuid not null references shops(id) on delete cascade,
  lightspeed_product_id bigint not null,

  visibility text,
  image jsonb, -- default variant image {src, thumb, title}

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  primary key (shop_id, lightspeed_product_id)
);

create index idx_products_shop
  on products (shop_id);

-- RLS: Products
-- Note: All authenticated users are manually-created admins with full access
alter table products enable row level security;

create policy "Authenticated users can read products"
  on products for select
  to authenticated
  using (true);

create policy "Authenticated users can insert products"
  on products for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update products"
  on products for update
  to authenticated
  using (true)
  with check (true);


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

create index idx_product_content_shop_lang
  on product_content (shop_id, language_code);

-- RLS: Product Content
-- Note: All authenticated users are manually-created admins with full access
alter table product_content enable row level security;

create policy "Authenticated users can read product content"
  on product_content for select
  to authenticated
  using (true);

create policy "Authenticated users can insert product content"
  on product_content for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update product content"
  on product_content for update
  to authenticated
  using (true)
  with check (true);


-- =========================
-- VARIANTS (SKU MATCHING CORE)
-- =========================
create table variants (
  shop_id uuid not null,
  lightspeed_variant_id bigint not null,
  lightspeed_product_id bigint not null,

  sku text not null,
  is_default boolean,
  price_excl numeric,
  image jsonb, -- {src, thumb, title}

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  primary key (shop_id, lightspeed_variant_id),
  foreign key (shop_id, lightspeed_product_id) references products(shop_id, lightspeed_product_id) on delete cascade
);

-- SKU index for searching (no uniqueness constraint due to duplicate SKUs in Lightspeed)
CREATE INDEX idx_variants_shop_sku ON variants (shop_id, sku)
  WHERE sku IS NOT NULL AND sku != '';

CREATE INDEX idx_variants_sku ON variants (sku)
  WHERE sku IS NOT NULL AND sku != '';

create index idx_variants_product
  on variants (shop_id, lightspeed_product_id);

-- Performance indexes for product_sync_status view
CREATE INDEX idx_variants_default_sku_shop 
  ON variants(shop_id, is_default, sku) 
  WHERE is_default = true AND sku IS NOT NULL AND sku != '';

CREATE INDEX idx_variants_created_at 
  ON variants(created_at DESC);

-- RLS: Variants
-- Note: All authenticated users are manually-created admins with full access
alter table variants enable row level security;

create policy "Authenticated users can read variants"
  on variants for select
  to authenticated
  using (true);

create policy "Authenticated users can insert variants"
  on variants for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update variants"
  on variants for update
  to authenticated
  using (true)
  with check (true);


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

create index idx_variant_content_shop_lang
  on variant_content (shop_id, language_code);

-- RLS: Variant Content
-- Note: All authenticated users are manually-created admins with full access
alter table variant_content enable row level security;

create policy "Authenticated users can read variant content"
  on variant_content for select
  to authenticated
  using (true);

create policy "Authenticated users can insert variant content"
  on variant_content for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update variant content"
  on variant_content for update
  to authenticated
  using (true)
  with check (true);



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
    updated_at timestamp with time zone not null default now()
);

-- Indexes
create index idx_sync_logs_shop on sync_logs(shop_id);
create index idx_sync_logs_status on sync_logs(status);
create index idx_sync_logs_started_at on sync_logs(started_at desc);
create index idx_sync_logs_shop_started on sync_logs(shop_id, started_at desc);

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
  using (true);


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

create trigger trg_sync_logs_updated
before update on sync_logs
for each row execute function set_updated_at();
