# Expenses — as built (review)

Status as of 2026-07-27. This doc describes **what works today**, not old design notes.

Related GitHub issues (deferred):
- [#3](https://github.com/Felipalds/gemini-stocks/issues/3) — auto-categorization (local LLM / rules)
- [#4](https://github.com/Felipalds/gemini-stocks/issues/4) — email-forward ingestion

---

## What shipped

### Core expenses
- Manual create / list (paginated) / **edit** / soft-delete
  - Edit asks: **only this one** vs **all with the same name** (bulk updates name + category; syncs merchant alias)
- Currencies: `BRL`, `USD`, `BTC` (amounts shown in BRL using cached FX)
- Recurring: `""` | `monthly` | `annually` (expanded when computing totals/analytics; unit-tested)
- Budgets API (CRUD) — used by analytics `budget_status`; **no dedicated budget UI yet**

### Credit card statement import
- Button: **Import credit card statement**
- PDF only; bank auto-detect + manual override (`nubank` | `inter`)
- Flow: upload → **preview** → confirm → insert
- Leading-null PDF repair (WhatsApp-padded Inter files)
- Per installment = one expense row
- Payments / IOF / similar lines start **unchecked**; purchases + parcels checked
- FX: keep original currency when present (e.g. USD on Nubank)
- Dedup via `external_key` (re-import skips duplicates)
- Categories left empty on import unless suggested by merchant alias / user pick
- Parsers live in agnostic files under `backend/internal/statements/` (registry, not bank-named files)
- Unit tests + optional live sample PDF tests

### Merchant aliases
- Table `merchant_aliases`: statement name → preferred display name (+ optional default category)
- On preview: backend loads aliases and prefills `name` / `category`
- UI: editable name, shows `original: …`, **Use original** (this import only)
- On confirm: if name ≠ original, upsert alias; past expenses are **not** rewritten

### Expense categories (master list)
- Table `expense_categories` + CRUD UI (**Manage categories**)
- `GET/POST/PUT/DELETE /expense-categories`
- Rename/delete master labels **does not** cascade to existing `expenses.category` strings
- Import preview has a Category column (dropdown + “New category…”)

### Analytics & charts (backend computes, frontend renders)
- `GET /expenses/analytics` and `GET /expenses/totals` do all aggregations
- Expenses page charts/KPIs:
  - This month + MoM %, **total spent all time**, avg daily 30d, avg monthly 12m, largest ever
  - Top category / merchant / month / day
  - Pie: category breakdown 30d
  - Bar: monthly spend
  - Horizontal bar: top 5 this month
  - Budget progress (when budgets exist)

### Other
- DB backups taken during this work (examples):  
  `backend/stocks.db.bak.20260527-191146`,  
  `backend/stocks.db.bak.20260727-145102`
- Personal statement PDFs gitignored (`*.pdf`)

---

## Data model (working)

### `expenses`
| Field | Notes |
|-------|--------|
| `id` | UUID |
| `name`, `category`, `value`, `currency`, `date`, `note` | Core fields |
| `recurring` | `""` / `monthly` / `annually` |
| `bank` | e.g. `nubank`, `inter`, or empty |
| `payment_type` | e.g. `credit`, `debit`, `pix`, `money`, `bitcoin` |
| `import_batch_id` | Groups one confirm import |
| `external_key` | Dedup key for statement lines |
| GORM | `created_at`, `updated_at`, soft `deleted_at` |

### `expense_categories`
| Field | Notes |
|-------|--------|
| `id`, `name` | Unique name; soft-delete |

### `merchant_aliases`
| Field | Notes |
|-------|--------|
| `original_key` | Normalized lookup (`NormalizeMerchantKey`) |
| `original_name` | Last seen statement text |
| `alias` | Suggested display name |
| `category` | Optional default category |

### `budgets`
| Field | Notes |
|-------|--------|
| `category` | Empty = overall monthly budget |
| `amount_brl` | Target in BRL |

---

## HTTP API (expenses-related)

| Method | Path | Status |
|--------|------|--------|
| POST | `/expenses` | Working |
| GET | `/expenses` | Working (pagination) |
| PUT | `/expenses/{id}` | Working |
| DELETE | `/expenses/{id}` | Working (soft) |
| POST | `/expenses/import` | Working (PDF preview) |
| POST | `/expenses/import/confirm` | Working |
| GET | `/expenses/totals` | Working |
| GET | `/expenses/categories` | Working (spend breakdown by category string) |
| GET | `/expenses/analytics` | Working |
| GET/POST/PUT/DELETE | `/expense-categories` | Working (master labels) |
| GET/POST/PUT/DELETE | `/budgets` | Working (API only) |

---

## Frontend (working)

| Piece | Location |
|-------|----------|
| Page | `frontend/src/pages/Expenses.tsx` |
| Charts | `frontend/src/components/organisms/ExpenseAnalyticsPanel.tsx` |
| Route | `/expenses` (header Wallet link) |
| Types | `frontend/src/types/index.ts` |

---

## Backend packages (working)

| Piece | Location |
|-------|----------|
| Models | `backend/internal/models/expense.go`, `merchant.go` |
| Handlers | `expense.go`, `expense_import.go`, `expense_category.go` |
| Statement parsers | `backend/internal/statements/` |
| Recurring tests | `backend/internal/handlers/expense_test.go` |
| Parser tests | `backend/internal/statements/*_test.go` |

---

## How import + aliases work (short)

1. PDF → text → bank detect/override → layout parser → lines  
2. Load `merchant_aliases`; match `NormalizeMerchantKey(original_name)`  
3. Prefill suggested `name` / `category`; keep `original_name`  
4. User edits preview → confirm  
5. Insert expenses; upsert alias when display name ≠ original; never rewrite old rows  

---

## TODOs

### Expenses / import
- [ ] Weekday spend pattern in analytics + chart (“spend 2× on Saturdays”)
- [ ] Forecast end-of-month vs budget
- [ ] Budget management UI (backend CRUD already exists)
- [ ] Historical FX rates at expense/instance time (today: latest cached rate)
- [ ] CSV / OFX import (PDF-only today)
- [ ] Auto-categorize merchants — [#3](https://github.com/Felipalds/gemini-stocks/issues/3)
- [ ] Email-forward ingestion — [#4](https://github.com/Felipalds/gemini-stocks/issues/4)
- [ ] Recurring auto-detection (manual recurring already works)
- [ ] Merchant-alias management UI (list/edit/delete aliases outside import)
- [ ] Payment-type picker on manual expense form (field exists; import sets `credit`)
- [ ] Soft-delete / undo whole `import_batch_id`

### Stocks (still open elsewhere)
- [ ] Wire `GET /data/summary`
- [ ] Background price-refresh worker

---

## How to run / test

```bash
# backend (restart after pulls so AutoMigrate + new routes load)
cd backend && go run ./cmd/api

# frontend
cd frontend && npm run dev
```

Open http://localhost:5173/expenses → import PDF, manage categories, check charts.

```bash
cd backend && go test ./...
```
