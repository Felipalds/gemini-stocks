# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent apps in one repo:

- `backend/` — Go 1.24 HTTP API (Chi + GORM + SQLite), entry point `cmd/api/main.go`.
- `frontend/` — React 19 + Vite + TypeScript SPA, styled with Tailwind v4 and shadcn/ui.

There is no monorepo tooling; each side is built and run independently.

## Commands

### Backend (run from `backend/`)
- Copy env: `cp .env.example .env` and fill in `ALPHA_API_KEY` before first run.
- Run dev server: `go run ./cmd/api` (listens on `PORT`, default `8080`).
- Build binary: `go build -o bin/api ./cmd/api`.
- Tidy modules: `go mod tidy`.
- No test suite exists yet; `go test ./...` is a no-op.

### Frontend (run from `frontend/`)
- Install: `npm install` (a `yarn.lock` also exists but `package-lock.json` is checked in — prefer npm to stay consistent).
- Dev server: `npm run dev` (Vite default `http://localhost:5173`).
- Production build: `npm run build` (runs `tsc -b` then `vite build`).
- Lint: `npm run lint`.
- There is no test runner configured.

The frontend talks to the backend at a **hardcoded** `http://localhost:8080` (see `src/contexts/AppContext.tsx`). Both servers must be running for the UI to load data.

## Architecture

### Backend request flow
`cmd/api/main.go` is the composition root: it loads `.env`, opens the SQLite DB, runs `AutoMigrate` on all models, constructs services and handlers, and wires routes on a single Chi router with CORS open to all origins. Layering is:

- `internal/models/` — GORM structs (`Transaction`, `Ticker`, `Currency`, `PortfolioGoal`/`GoalAllocation`). `Transaction.ID` is a UUID string assigned in a `BeforeCreate` hook; tickers are keyed by symbol; currencies by code (the only row in practice is `USD` → BRL rate).
- `internal/services/finance.go` — `FinanceService` wraps the Alpha Vantage API. Two quirks live here: BRL symbols get a `.SAO` suffix appended, and crypto pairs like `BTC/USD` have the slash stripped before querying. Rate-limit responses are detected by scanning the `Information` field for "rate limit".
- `internal/handlers/` — one file per route group. Handlers own their `*gorm.DB` and call `FinanceService` directly.
- `internal/database/db.go` — opens SQLite (path from `DB_NAME`, default `stocks.db`) and contains a one-time legacy rename of `stock_prices` → `tickers`. Leave that block alone unless you know no instance still has the old table.

Ticker rows act as a **price cache**, not a master list of instruments. The cache is populated lazily: when a transaction comes in for an unknown symbol, `TransactionHandler.ensureStockExists` fetches the price and inserts a ticker row. `POST /prices/refresh` iterates every cached ticker and re-fetches; it also refreshes the USD/BRL rate as a side effect.

Routes (all mounted at root, no `/api` prefix):
- `/transactions` — CRUD plus `POST /transactions/import` for Excel upload (xlsx via `excelize`).
- `/prices` — list, manual refresh, edit tags/category/price/currency.
- `/currencies` — list, get USD rate, refresh USD rate.
- `/goal` — single portfolio goal with allocations (saving replaces the existing goal).
- `/data/summary` — declared but **not implemented** (empty handler body).
- `/health` — liveness probe.

`GET /transactions` enriches each row with `current_price`, `market_value`, `pnl`, `pnl_percent` computed in Go using the cached ticker price; the frontend should not recompute these from scratch.

### Frontend
- Routing is two routes only: `/` (Dashboard) and `/add` (AddTransaction), defined in `src/App.tsx`.
- Global state lives in `src/contexts/AppContext.tsx` — it fetches transactions, prices, and the USD rate in parallel on mount, exposes `refreshData`, `syncPrices`, and a `hideValues` toggle for masking monetary values in the UI.
- Component structure under `src/components/` loosely follows Atomic Design (`molecules/`, `organisms/`, `templates/`, plus shadcn primitives in `ui/`). There is no `atoms/` directory despite the README's claim.
- Path alias `@` → `./src` is configured in both `vite.config.ts` and `tsconfig.app.json`; use `@/...` imports in new code.
- shadcn is configured in `components.json` with the `new-york` style and `neutral` base; add new primitives via `npx shadcn add <name>` rather than hand-writing them.

### Money and currency conventions
- `Transaction.Currency` defaults to `USD` server-side if omitted.
- The frontend assumes BRL as the display currency and converts USD positions via the cached USD→BRL rate from `/currencies/usd`. If a transaction is in BRL, do not double-convert.
- Alpha Vantage's free tier rate-limits aggressively; the backend logs but does not retry. Manual `POST /prices/refresh` is the only refresh path — there is no scheduled background worker currently running despite what the README implies.
