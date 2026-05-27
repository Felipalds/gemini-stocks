# Expenses Module — Plan & Suggestions

## Database changes

A SQLite backup was taken before any change:
`backend/stocks.db.bak.20260527-191146`.

### New table: `expenses`

Managed by GORM `AutoMigrate` (no manual migration SQL needed).

| Column        | Type         | Notes                                       |
|---------------|--------------|---------------------------------------------|
| `id`          | TEXT (UUID)  | Primary key, generated in `BeforeCreate`    |
| `name`        | TEXT         | Short label, e.g. "Uber to airport"         |
| `category`    | TEXT, indexed| Free-form category string, e.g. "Transport" |
| `value`       | REAL         | Amount in the original `currency`           |
| `currency`    | TEXT         | `BRL`, `USD`, or `BTC`. Default `BRL`       |
| `date`        | DATETIME     | When the expense occurred                   |
| `note`        | TEXT         | Optional free-form note                     |
| `created_at`  | DATETIME     | `gorm.Model`                                |
| `updated_at`  | DATETIME     | `gorm.Model`                                |
| `deleted_at`  | DATETIME     | `gorm.Model` soft delete                    |

### Currency reuse

The existing `currencies` table (USD→BRL only) is extended to also hold the
BTC→BRL rate. No schema change is needed — only a second row keyed by code
`BTC`. The `FinanceService.GetExchangeRate` already accepts arbitrary
from/to codes (Alpha Vantage's `CURRENCY_EXCHANGE_RATE` supports crypto).

The `POST /prices/refresh` endpoint is updated to also refresh BTC alongside
USD so a single sync covers both.

## Backend routes

All mounted under `/expenses`:

| Method | Path                  | Purpose                                              |
|--------|-----------------------|------------------------------------------------------|
| POST   | `/expenses`           | Create one expense                                   |
| GET    | `/expenses`           | Paginated list (`page`, `page_size` query params)    |
| PUT    | `/expenses/{id}`      | Update                                               |
| DELETE | `/expenses/{id}`      | Soft delete                                          |
| GET    | `/expenses/totals`    | Total spent — `filter=day\|month\|year` + optional `from`/`to` |
| GET    | `/expenses/analytics` | Top category / name / day / month / year + extras    |

All amounts in responses are converted to **BRL** using the cached rates
from the `currencies` table, mirroring how the stocks side does it. The
original value + currency are also returned so the UI can show both.

### Pagination response shape

```json
{
  "page": 1,
  "page_size": 25,
  "total": 137,
  "items": [ { ...Expense, "value_brl": 123.45 } ]
}
```

### Totals route

`GET /expenses/totals?filter=month` returns:

```json
{
  "filter": "month",
  "buckets": [
    { "key": "2026-05", "total_brl": 4321.10 },
    { "key": "2026-04", "total_brl": 5102.55 }
  ]
}
```

`filter=day` → buckets keyed `YYYY-MM-DD`, `filter=year` → `YYYY`.
Optional `from` / `to` (ISO-8601 dates) narrow the range; default = all time.

### Analytics route

`GET /expenses/analytics` returns a single blob with everything the
dashboard wants in one call:

```json
{
  "top_category":  { "name": "Food",      "total_brl": 12345.67 },
  "top_name":      { "name": "iFood",     "total_brl":  2345.67 },
  "top_day":       { "key": "2026-04-12", "total_brl":   987.65 },
  "top_month":     { "key": "2026-04",    "total_brl":  5432.10 },
  "top_year":      { "key": "2026",       "total_brl": 65432.10 },
  "category_breakdown_30d": [ { "name": "Food", "total_brl": 800 }, ... ],
  "average_daily_30d":  123.45,
  "average_monthly_12m": 4321.10,
  "weekday_pattern":    [ { "weekday": "Mon", "avg_brl": 80.5 }, ... ],
  "largest_single":     { "name": "Flight", "value_brl": 3200, "date": "..." }
}
```

## Suggestions for additional analytics

Cheap to compute, high signal — pick whichever resonate:

1. **Category breakdown for an arbitrary period** — for pie chart on the
   monthly report page. Yes, add this
2. **Average daily / monthly spend** — over rolling 30 / 365 days. -> yes
3. **Weekday pattern** — "you spend 2× more on Saturdays" sort of insight.
4. **Largest single expense ever** — quick anchor for outliers. -> yes
5. **Month-over-month delta** — "this month is 14 % higher than last". -> yes
6. **Burn rate vs. budget** — once budgets are introduced, % of budget -> yes, let's add budget, create a todo.md file to track future features.
   already consumed in the current month.
7. **Recurring detection** — expenses with the same name + similar value
   appearing every month (Netflix, gym). Powerful but not trivial — leave
   for a follow-up. -> we will not do a detection, let's add a variable on the schema database to add a recurring function. It can be anually or monthly. The app when fetching will fetch this as well and sum. Remember to create a test unit for this
8. **Forecast end-of-month** — extrapolate current daily average across
   remaining days; pairs well with budgets. -> not need now
9. **Top-N expenses for the month** — the five biggest line items, useful
   for spotting the things worth cutting. -> yes

Items 1-5 and 9 are included in the initial `/expenses/analytics`
response. 6-8 are flagged here as candidates for a second pass.

## Frontend changes

Minimal first cut — a separate page reachable from the dashboard header.

- `frontend/src/types/index.ts` — add `Expense` interface.
- `frontend/src/App.tsx` — add `<Route path="/expenses" element={<ExpensesPage />} />`.
- `frontend/src/components/templates/DashboardLayout.tsx` — add a
  `<Link to="/expenses">` button in the header (uses lucide `Wallet`
  icon).
- `frontend/src/pages/Expenses.tsx` (new) — paginated table of expenses
  plus an inline form (name, category, value, currency, date, note) for
  creating new ones. Uses the existing shadcn primitives (`Card`,
  `Table`, `Input`, `Select`, `Button`).

This intentionally avoids touching `AppContext` — the expenses page owns
its own fetch state. Once we add the monthly-report page, we can extract
a small `useExpenses` hook.

## Files touched

### New
- `backend/internal/models/expense.go`
- `backend/internal/handlers/expense.go`
- `frontend/src/pages/Expenses.tsx`
- `EXPENSES.md` (this file)

### Edited
- `backend/cmd/api/main.go` — register expense routes, add Expense to AutoMigrate.
- `backend/internal/handlers/price.go` — also refresh BTC on `/prices/refresh`.
- `backend/internal/handlers/currency.go` — add BTC rate endpoint (mirrors USD).
- `frontend/src/App.tsx` — add `/expenses` route.
- `frontend/src/components/templates/DashboardLayout.tsx` — add header button.
- `frontend/src/types/index.ts` — add `Expense` type.

### DB
- Backup taken: `backend/stocks.db.bak.20260527-191146`.
- New table `expenses` created automatically by `AutoMigrate` on next start.
- No destructive change to existing tables.
