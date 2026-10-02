# Feature: Reconstructed monthly portfolio evolution

> **Status: IMPLEMENTED.** Backend `GET /portfolio/history` +
> `POST /portfolio/history/backfill`; frontend `PortfolioReconstructionChart` on the
> dashboard. Value + P&L lines, monthly, fixed balances excluded, starts at the
> first transaction month. Run the backfill once (button in the chart, or
> `POST /portfolio/history/backfill`) to populate `history_tickers` + `USDBRL=X`.

## 1. The idea

Today's **Portfolio evolution** chart is built from `portfolio_snapshots` — rows we
only start creating the day you first click **Take snapshot**. It can never show
history from *before* snapshots existed.

We want a **second, cloned chart** that reconstructs the portfolio's total value
for **every month since your first transaction**, using:

- the **order dates** in `transactions` to know what you held at each month-end, and
- the **monthly close prices** we already cache in `history_tickers` to value it.

Think of it as: "if I had taken a snapshot at the end of every month since the
beginning, what would it have shown?" — computed after the fact from data we have.

The two charts are complementary:

| Chart | Source | Granularity | Nature |
|---|---|---|---|
| Portfolio evolution (existing) | `portfolio_snapshots` | per-snapshot (≈ daily) | exact, forward-only |
| **Reconstructed evolution (new)** | `transactions` × `history_tickers` × FX history | **monthly** | approximate, backfilled |

---

## 2. How the reconstruction works

For each month `M` from the first transaction's month up to the current month:

1. **Holdings at end of `M`** — for every symbol, sum `quantity` of `BUY`s minus
   `SELL`s across all transactions with `date <= endOf(M)`. This is a cumulative
   walk over transactions sorted by date.
2. **Price of each symbol at `M`** — `history_tickers.close` where
   `period = M` (format `YYYY-MM`), quoted in the symbol's native currency.
3. **Value in BRL** — `netQty × close × fx(nativeCurrency → BRL, M)`.
4. **Month total** — sum across all symbols held that month.

The result is one `(month, totalValueBRL)` point per month → the line chart.

### Worked example
You bought 100 GGBR4 in 2023-03 and 0.1 BTC/USD in 2023-07.

- 2023-03: hold 100 GGBR4 → `100 × close(GGBR4, 2023-03) × 1` (already BRL)
- 2023-07: hold 100 GGBR4 **and** 0.1 BTC → add `0.1 × close(BTC-USD, 2023-07) × fx(USD→BRL, 2023-07)`

---

## 3. The one real gap: historical FX rates

`history_tickers` is only populated for symbols that appear in your transactions
(it's a lazy price cache). It therefore has **no `USDBRL=X` row**, so we cannot
currently convert a USD-quoted month to BRL *at that month's rate*.

Options, worst to best:

- ❌ Use **today's** USD→BRL rate for every historical month. Cheap but wrong — a
  2022 USD position would be valued at the 2026 dollar, distorting the whole curve.
- ✅ **Backfill `USDBRL=X` into `history_tickers`** as just another symbol. Our
  existing `FetchMonthlyHistory("USDBRL=X", …)` already works: `buildYahooSymbol`
  leaves `USDBRL=X` untouched (no `/`, not a `.SA` stock), and Yahoo returns the
  monthly FX close. Then `fx(USD→BRL, M) = history_tickers[("USDBRL=X", M)].close`.

**Decision: backfill the FX series into `history_tickers`** like any other ticker.
Crypto quoted directly in USD (`BTC-USD`) is valued in USD via `history_tickers`
and then converted with the same `USDBRL=X` series — no separate BTC→BRL history
needed.

### Price/FX gaps within the window
- **Null months** (Yahoo returns `null` close; we already skip `close == 0`): fill
  forward from the last known close for that symbol.
- **Symbol has no history as far back as a month you held it** (rare — IPO/listing
  after you bought, or Yahoo truncation): value that symbol at its *earliest*
  available close for those earlier months, and flag the month as `partial` so the
  UI can render it muted / dashed.
- **Month with holdings but zero resolvable prices**: skip the point rather than
  plotting a misleading zero.

---

## 4. Build-once vs compute-on-app

The user's instinct — "a script that runs once, and from now on we calculate on
app" — splits cleanly into two concerns:

### 4a. The "run once" part = **data backfill**, not value backfill
What actually needs a one-time job is making sure the **inputs** exist:
1. For every distinct symbol in `transactions`, ensure `history_tickers` has its
   full monthly series (`POST /tickers/history/sync?symbol=…` already does this).
2. Sync the `USDBRL=X` monthly series into `history_tickers` once.

Expose this as one endpoint, e.g. `POST /portfolio/history/backfill`, that loops
over the transaction symbols + `USDBRL=X` and calls the existing sync path. Safe to
re-run (upserts on `(symbol, period)`).

### 4b. The "from now on" part = **compute on the fly**
The reconstructed curve is a **pure function** of `transactions`, `history_tickers`
and the FX series — all already in SQLite. So we do **not** store reconstructed
points in a table. Instead:

- `GET /portfolio/history` computes the monthly series live (sorted transaction
  walk + map lookups; cheap — bounded by months × symbols).

**Why not store it?** Storing would require re-deriving on every edit (a backdated
transaction, a corrected price, an FX resync all invalidate past months). Computing
live keeps it always-correct and avoids a third snapshot table to keep in sync. The
existing `portfolio_snapshots` table stays exactly as-is for the exact/daily chart.

> Trade-off to accept: the live computation re-reads all transactions + history on
> each chart load. Given single-user scale this is negligible; if it ever isn't, we
> can memoize by `(max(transaction.updated_at), max(history.created_at))`.

---

## 5. Proposed implementation

### Backend
- **`GET /portfolio/history`** → `[{ period: "2023-03", date, total_value_brl, total_pnl_brl, partial: bool }]`
  - Load all transactions (sorted by date), all `history_tickers`, build
    `price[symbol][period]` and `fx[period]` maps (with forward-fill).
  - Walk months from first transaction to current; accumulate net qty **and
    cumulative buy cost in BRL at each buy's own month FX** (what you actually
    paid) per symbol; value holdings at the month's close × that month's FX and sum.
    `total_pnl_brl = total_value_brl − cost_basis_brl`. Emit one row per month.
  - **Fixed balances are excluded** (see §6).
- **`POST /portfolio/history/backfill`** → ensures history for all transaction
  symbols + `USDBRL=X`. Returns `{ symbols_synced, fx_synced, skipped }`.
- Reuse `FinanceService.FetchMonthlyHistory`, `buildYahooSymbol`, and the
  `convertPrice` helper already in `handlers/money.go`.
- New handler file `internal/handlers/portfolio_history.go`; wire routes under a
  `/portfolio` group in `cmd/api/main.go`. **No new model / migration** (reuses
  `history_tickers`).

### Frontend
- Clone `PortfolioEvolutionChart.tsx` → `PortfolioReconstructionChart.tsx`:
  - Fetch `GET /portfolio/history` instead of `/snapshots`.
  - Same collapsible card + recharts `LineChart`, monthly X-axis labels.
  - Replace "Take snapshot" with a **"Backfill history"** button → `POST
    /portfolio/history/backfill`, then reload. Render `partial` months muted.
  - Respect `hideValues`.
- Drop it next to the existing evolution chart on the dashboard.

---

## 6. Decisions & open questions

**Recommended defaults (baked into §5):**
1. **Monthly granularity** — matches `history_tickers`; no finer data exists. ✅
2. **Compute live, don't store** reconstructed points (§4b). ✅
3. **Backfill `USDBRL=X`** for historical FX (§3). ✅
4. **Exclude fixed balances** — they carry no historical timeline (we don't know
   when a "fixed" balance existed in the past), so including them would smear
   today's value backwards. The reconstruction is about *traded* holdings. ✅

**Confirmed:**
- **A. Value + P&L together.** Reconstruct historical cost basis (cumulative buy
  cost converted at each buy's own month FX — the BRL you actually paid) alongside
  value, and draw both lines — `total_value_brl` and `total_pnl_brl`. Note this
  differs from the live snapshot, which values cost at *today's* FX; the
  reconstruction's current-month P&L will therefore diverge slightly from the live
  snapshot's — expected and documented as approximate.
- **B. Exclude fixed balances.** They carry no historical timeline, so they are left
  out of the reconstruction entirely.
- **C. Start at the first transaction's month.** No empty pre-history padding.

---

## 7. Rollout steps
1. Add `GET /portfolio/history` + `POST /portfolio/history/backfill` (backend).
2. Run the backfill once (syncs transaction symbols + `USDBRL=X`).
3. Add `PortfolioReconstructionChart` (value + P&L lines) to the dashboard.
4. Verify a known month by hand (holdings × close × fx) against the curve.
