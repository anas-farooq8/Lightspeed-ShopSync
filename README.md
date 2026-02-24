# Lightspeed ShopSync

> A web-based product sync tool for syncing products between Lightspeed eCom shops using the Lightspeed API. Built for multi-store e-commerce operations with full translation support and manual control over every sync operation.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-Sync%20Cron-2088FF?style=for-the-badge&logo=github-actions)](https://github.com/features/actions)
[![Lightspeed eCom](https://img.shields.io/badge/Lightspeed-E--commerce-000000?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADZ0lEQVRYhaXXS2heRRQH8J9BSigSJJRwkaEEoUZ8VCulC5FaMEFxIxZfiIriA+qrtVpKkVAkBFdaLeLalY/ahQiC2LqwitaViKUiLaXoUC6lBClBQgnBxcynk4/vcb8vZ3Xnf+/8/zNnzpxzLmuwOoSNdQija+EYWctkvIM31kJw1bAT6xC24zv8g6kqxjgMz1AeqEMYkXYP6/HSMDxDLwBPYGsx/mvYBQx8BHUI63EG12XoLG7GKBarGFcG4RvGA/sLcXitivEK5vD0oGQDeaAOIeAP6dzhG9yLm/ArFrCpivFyU85BPfB2Ib4s7Z4UkFdjAq8OQth4AXUI2/B4AX1YxXi6DuF+3DcMJw2PoA4BvsddGbqEKSziN9yQ8QVswt9Ng7Hpah8pxOFgFeMCXi7EYTbje+sQSq90tb4eyLn+d0xm6BS2YFwKyGvb8A0Zv4BbqxiXe/E38cCeQhx2Z9K5QpwUkMuYxxhuxIv9yHt6oA5hQko6Yxn6oorxwTqEzfil2MCXVYwP1CFsxc8FviDViUvdNPp5YK4QX8LrOSDfL+Ze6YKTjumtXgJdF5B3+VwBvVfFeA47saMNPytd0Ts7UL1Qh3BLN52uR1CHcAzTeXhBunbLVgdknfGVjIcCH8e6PD6OmapDxe7ogbz76QI6UMW4iL1WB+SbOe3uL8RhHz4oxtO4vZNWtyO4vnhewtH8/GQbfqQOYdLqrugkPsZnbZyTOli3BZwunkelnZOCssT3SHWg1ReuSNd0BQd7cP5nvWLgczyUh4vSWdf4CdsyvlSIw0dVjM/k+vBVgR+tYny4k06va7gvC8A1mM872118U4pfxoE6hHU4VOBLUox0tK4LqGI8j8MF9FQdwh1VjCfxaYcp81WMtVSOy/pwOF/fjtYvE45JmXAiQydwNzZK167VG7TaslZ9aCWvi/o0KD0zYZ44W0DbsbOK8U//B+QyXsltWasOtGy2X3fUpBqOSHl/c4bO4bYqxsWc4RarGM/XIezAt8WmTmFLv2rYtCGZxrECOoFduSMaldr0Q1KwtmymivF4P+7GTWkdwid4rA1ekOKg/f/wSBXjo014B+nfnscPbdh4B/Ef8WxT0sYLyLVgBu9KJbjdruR39+RvG9lQP6d1CBukTngqQ2fwdRXjxUG5/gXjDRD1FVFwowAAAABJRU5ErkJggg==)](https://developers.lightspeedhq.com/ecom/introduction/introduction/)

---

## Overview

Lightspeed ShopSync enables seamless product synchronization across multiple Lightspeed eCom storefronts. Designed for businesses operating in multiple regions (e.g., .nl, .de, .be), it provides a manual, user-controlled workflow with preview-before-sync, automatic translation, and intelligent handling of duplicate SKUs.

### Core Philosophy

- **Manual sync only** - Nothing syncs automatically; you decide what to create, update, or skip
- **Source of truth** - One shop (e.g., .nl) is the source; all sync flows from it
- **Product-level sync** - Variants are synced as a unit, preserving product structure
- **Full control** - Edit content, select variants, and choose target shops before any operation

---

## Features

### Sync Operations

| Tab | Purpose |
|-----|---------|
| **CREATE** | Create missing products in target shops from source |
| **EDIT** | Update existing products in target shops with source data |
| **NULL SKU** | Handle products with missing default SKUs (shop-specific edits) |

### Smart Matching & Duplicate Handling

- **Product-level matching** using variant SKU as the key
- **Duplicate detection** in both source and target shops
- **Scenario support**: 1-1, M-1, M-M, 1-M (with source/target selectors)
- **Match type indicators**: Default variant vs non-default variant (structure mismatch)

### Translation System

- **Automatic translation** via Google Cloud Translation API (NL → DE, FR)
- **Identical copy** for same-language targets (e.g., NL → NL on .be)
- **Preview before sync** — All translations visible and editable
- **Manual edit protection** — User edits are never overwritten
- **Re-translate** — Per field or entire language
- **Session-based caching** — Efficient batching by language pair

### Dashboard & UX

- KPI cards per shop with sync status
- Last sync metrics and timestamps
- Tabbed interface with CREATE, EDIT, NULL SKU
- Table and grid view modes
- Server-side pagination, search, sorting, filtering
- URL state management — Filters and navigation preserved
- Responsive design with shadcn/ui components

---

## Tech Stack

- **Framework**: Next.js 16.1, React 19.2
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/password, signup disabled)
- **Styling**: Tailwind CSS, shadcn/ui, Radix UI
- **APIs**: Lightspeed eCom API, Google Cloud Translation API

---

## Shops Configuration

The project is **dynamic** and supports multiple shops. Shops are configured in the database and via environment variables (`LIGHTSPEED_API_KEY_{TLD}`, `LIGHTSPEED_API_SECRET_{TLD}`). One shop acts as the source of truth; others are targets. Example setup:

| Shop | Store # | URL | Role | Languages |
|------|----------|-----|------|-----------|
| VerpakkingenXL | #293467 | verpakkingenxl.nl | **SOURCE** | NL |
| VerpackungenXL | #293470 | verpackungenxl.de | TARGET | DE |
| VerpakkingenXL-BE | #343623 | verpakkingenxl.be | TARGET | NL, FR |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Lightspeed eCom API credentials
- Google Cloud Translation API key (optional, for auto-translation)

### Installation

```bash
# Clone the repository
git clone https://github.com/anas-farooq8/Lightspeed-ShopSync.git
cd Lightspeed-ShopSync

# Install dependencies
npm install

# Set up environment variables (see below)
cp .env.example .env.local
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# App URL (optional)
# Local: http://localhost:3000
# Deployment: https://your-app.vercel.app
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Lightspeed eCom API (per shop TLD: NL, DE, BE)
LIGHTSPEED_API_KEY_NL=your_lightspeed_api_key_here
LIGHTSPEED_API_SECRET_NL=your_lightspeed_api_secret_here
LIGHTSPEED_API_KEY_DE=your_lightspeed_api_key_here
LIGHTSPEED_API_SECRET_DE=your_lightspeed_api_secret_here
LIGHTSPEED_API_KEY_BE=your_lightspeed_api_key_here
LIGHTSPEED_API_SECRET_BE=your_lightspeed_api_secret_here

# Google Cloud Translation API (Service Account)
# Grant role: Cloud Translation API User
# Enable: https://console.cloud.google.com/apis/library/translate.googleapis.com
GOOGLE_TYPE=service_account
GOOGLE_PROJECT_ID=project-id
GOOGLE_PRIVATE_KEY_ID=project-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=service-account-email
GOOGLE_CLIENT_ID=client-id
GOOGLE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
GOOGLE_CLIENT_CERT_URL=google-client-cert-url
GOOGLE_UNIVERSE_DOMAIN=googleapis.com
```

### Database Setup

Run the SQL scripts in order (see `scripts/` folder):

1. `01-init-schema.sql` — Tables, indexes, RLS, triggers
2. `02-rpc-functions.sql` — Dashboard KPIs, sync log functions
3. `03-product-sync-view.sql` — Product sync status view
4. `04-sync-operations-rpc.sql` — Sync operations RPC
5. `05-product-details-rpc.sql` — Product details RPC

### Run the App

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

### Data Sync

**Option 1: Manual (local)**

```bash
# Requires Python 3.11+ and pip install -r requirements.txt
python scripts/sync.py
```

**Option 2: GitHub Actions (automated)**

A scheduled workflow syncs products daily via `.github/workflows/sync-cron.yml`:

- **Schedule:** Runs daily at 00:05 UTC
- **Manual trigger:** Available from the GitHub Actions tab (`workflow_dispatch`)
- **Secrets required:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and per-shop `LIGHTSPEED_API_KEY_{TLD}`, `LIGHTSPEED_API_SECRET_{TLD}` (e.g. NL, DE, BE)

Configure secrets in **Settings → Secrets and variables → Actions**.

---

## Project Structure

```
├── app/
│   ├── api/                          # API routes
│   │   ├── create-product/           # POST - Create product in target shop
│   │   ├── last-product-operation/   # GET - Last 10 product ops (dashboard)
│   │   ├── last-sync/                # GET - Last sync info per shop
│   │   ├── product-details/          # GET - Product by SKU or product ID
│   │   ├── product-images/           # GET - Fetch images from Lightspeed API
│   │   ├── product-operation-logs/   # GET - Paginated create/edit logs
│   │   ├── shops/                    # GET - All shops (source + target)
│   │   ├── stats/                    # GET - Dashboard KPIs
│   │   ├── sync-logs/                # GET - Paginated sync logs by date
│   │   ├── sync-operations/          # GET - Paginated CREATE/EDIT/NULL SKU
│   │   ├── translate/                # POST - Batch translation (Google)
│   │   └── update-product/           # PUT - Update product in target shop
│   ├── dashboard/                    # Protected dashboard pages
│   │   ├── product-sync-logs/        # Product operation logs
│   │   ├── sync-logs/                # Shop sync logs
│   │   └── sync-operations/          # CREATE, EDIT, NULL SKU tabs
│   │       ├── preview-create/[sku]/ # Create flow
│   │       ├── preview-edit/[sku]/    # Edit flow
│   │       ├── product/[productId]/   # Null SKU product view
│   │       └── products/[sku]/       # SKU-based product view
│   ├── login/                        # Auth page
│   └── layout.tsx
├── components/
│   ├── sync-operations/               # Tabs, dialogs, product list, panels
│   ├── sync-logs/                    # Sync log cards
│   ├── product-sync-logs/            # Product operation logs
│   ├── dashboard/                    # Stats, last sync, KPIs
│   ├── shared/                       # Shared product operation components
│   └── ui/                           # shadcn/ui components
├── lib/
│   ├── services/                     # create-product, update-product, translation, lightspeed-api, image-handler
│   ├── supabase/                     # Client & server Supabase
│   ├── cache/                        # Product images cache
│   ├── constants/                    # Product UI constants
│   └── api.ts                        # API helpers
├── hooks/                            # useProductEditor, useProductNavigation
├── types/                            # database, product, lightspeed-api
├── scripts/                          # SQL schema (01–05), sync.py
├── .github/workflows/
│   └── sync-cron.yml                 # Daily Lightspeed sync (00:05 UTC)
└── docs/                             # PROJECT_UNDERSTANDING, TRANSLATION_SYSTEM
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Dashboard KPI statistics per shop |
| GET | `/api/last-sync` | Last sync information per shop |
| GET | `/api/shops` | All shops (source + target) |
| GET | `/api/sync-operations` | Paginated sync operations (CREATE/EDIT/NULL SKU) |
| GET | `/api/product-details` | Product details by SKU or product ID |
| GET | `/api/product-images` | Fetch product images from Lightspeed API (link, shopTld) |
| GET | `/api/product-operation-logs` | Paginated create/edit operation logs |
| GET | `/api/last-product-operation` | Last 10 product operations (dashboard) |
| GET | `/api/sync-logs` | Paginated sync logs grouped by date |
| POST | `/api/create-product` | Create product in target shop(s) |
| PUT | `/api/update-product` | Update product in target shop |
| POST | `/api/translate` | Batch translation (Google Cloud Translation API) |

---

## Data Synced

**In scope:** Title, variant title, description, content (HTML), selling price, images, variants

**Out of scope:** Stock levels, delivery info, category structure

---

## License

Private project. All rights reserved.
