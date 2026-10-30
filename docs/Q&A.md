# Q&A — Project Design Decisions & Memory

> **Purpose:** This is a *living document*. It records the questions asked during
> development, the decisions made, and the current real state of the project.
> It exists mainly so that (1) an LLM assistant can quickly load the "why" behind
> the design, and (2) the project owner can remember past decisions.
>
> **⚠️ KEEP THIS UPDATED AT ALL TIMES.** Whenever a design decision is made,
> a question is answered, or a fact about how the system works is discovered,
> add/update an entry here in the same change.

_Last updated: 2026-10-30 (feature implemented)._

---

## Topic: Dollar cost / purchase-day exchange rate ("closest to reality")

### Goal
Record the **real BRL cost** of every foreign-currency purchase, so "total
invested" and "profit" reflect reais actually spent and earned — including the
currency (FX) gain — instead of being reconstructed with *today's* exchange rate.

### Q: When I buy US stocks, how is it saved today? Which dollar rate?
**A (current state):** A US buy is a plain `Transaction` row with `Price` stored
verbatim in its `Currency` (defaults to `USD`). **No exchange rate is stored on
the transaction.** Conversion to BRL happens only at *read time* using the single
*current* cached USD→BRL rate (the one `USD` row in the `currencies` table; falls
back to a hardcoded `5.5`). So historical FX on the purchase date is currently lost.

### Q: Should the stored purchase-day rate drive cost basis & PnL, or just be recorded?
**A: Drive cost basis & PnL.**
- Cost / "invested" (BRL) uses the **historical** purchase-day rate.
- Current market value (BRL) keeps using **today's** rate (what it's worth now).
- Effect: "invested" typically drops to what was really paid; PnL typically rises
  because the FX gain becomes visible. Market value is unchanged.

### Q: What IOF should be applied to the auto-fetched rate?
**A: Fixed, configurable, buy ≠ sell.**
- IOF rates are stored in the **database** (not `.env`), editable from a Settings page.
- Buy and sell have **different** IOF rates.
- The effective rate (FX × (1 + IOF)) is **snapshotted onto each transaction at
  creation**, so changing IOF later (e.g. when the government changes it) only
  affects *future* transactions — history stays correct.

### Q: Where is the rate stored? New table per transaction?
**A: No new per-transaction table.** A single new column on the existing
`transactions` table: `exchange_rate` = the effective all-in USD→BRL rate actually
paid (FX + IOF + spread). `1.0` for BRL transactions.

### Q: AutoMigrate makes existing rows default to 0 — won't that zero out BRL totals?
**A: Yes, so `0` is never used as a multiplier.** Everywhere (backend `GetAll` and
all frontend cost-basis sites) the rule is:
`rate = exchange_rate > 0 ? exchange_rate : currentDollarRate`.
A `0`/unset row transparently falls back to today's rate (= today's behavior),
never multiply-by-zero. `0` only ever means "old row, not yet backfilled".

### Q: How should the rate be captured for NEW transactions?
**A: Auto-fetched, with IOF added, editable.**
- Backend fetches the historical USD→BRL rate for the transaction's date,
  applies the configured IOF (buy/sell), and that becomes the default.
- On the (USD) transaction form the rate is **shown and editable**, so the owner
  can overwrite it with the exact rate from the broker note (nota de corretagem) —
  the single most accurate source. This makes historical-IOF drift irrelevant.

### Q: How are already-saved transactions handled?
**A: Auto-estimate, then editable.**
- A one-time, idempotent, re-runnable backfill (`POST /transactions/backfill-rates`)
  fills only rows with `exchange_rate == 0`, using the historical FX close on/before
  each transaction's `Date` (stepping back to the previous business day for
  weekends/holidays) × current IOF.
- The owner then hand-corrects any that matter from broker notes via the edit form.
- FX is the dominant driver (~10% swings); IOF is ~0.38%, so applying current IOF
  to old rows is a negligible approximation (and editable).

### Q: And Bitcoin transactions? How are they stored today?
**A (current state):** BTC is stored as `symbol = "BTC/USD"`, `currency = "USD"`,
`price` = BTC price in dollars, `quantity` = fractional BTC. Oldest buys go back to
**2021** (when USD≈5.2–5.7, so date-accurate FX matters a lot).
**Implication:** BTC is USD-denominated and needs the *same* treatment as US stocks —
no special code. Uniform rule:
- `currency == USD` (US stocks **and** BTC/USD) → historical FX × (1 + IOF), editable.
- `currency == BRL` → rate = 1 (already real; no FX, no IOF).

Data snapshot at time of writing: 149 USD transactions, 24 BRL. The BTC-specific
code in `finance.go` (`GetExchangeRate`) is for *valuing holdings*, not transaction
cost, and is not involved here.

---

## Topic: Settings / Configuration page

### Q: Where do IOF & other config live and how are they edited?
**A:** A new **Settings page** reachable from the ☰ ("More actions") menu in
`DashboardLayout.tsx` (route `/settings`). Backed by a singleton settings row in
the DB (same pattern as the `currencies` row) so it's extensible.
- First pass: edit **USD rate** (manual set, not just fetch) + **IOF buy/sell**.
- Later: profile, name, preferences, etc. appended to the same page/table.

---

## Implementation plan (status tracker)

Backend:
- [x] `models/transaction.go`: add `ExchangeRate float64` column (json `exchange_rate`).
- [x] Settings model + table (singleton, id=1): `IOFBuyRate`, `IOFSellRate` (extensible). `models/setting.go`, `handlers/setting.go` with `GetSettings(db)` helper.
- [x] `GET /settings`, `PUT /settings`.
- [x] Manual `PUT /currencies/usd` (hand-set USD rate).
- [x] `services/finance.go`: `GetHistoricalRate(from, to, date)` via `USDBRL=X` daily series (period window, picks close on/before the date).
- [x] `GET /currencies/rate?from=USD&date=…&type=BUY` → `{market, iof, rate}` for form auto-fill.
- [x] `Create` + `Update` + `ImportExcel`: snapshot effective rate via `computeExchangeRate` (honor payload override).
- [x] `GetAll`: serializes `exchange_rate` automatically (embedded model). `0` falls back to current rate on the frontend.
- [x] `POST /transactions/backfill-rates`: idempotent backfill of `exchange_rate <= 0` rows.

Frontend:
- [x] `types/index.ts`: add `exchange_rate?: number` to `Transaction`.
- [x] `TransactionForm.tsx`: editable "USD→BRL rate (incl. IOF)" field for USD, auto-filled from `/currencies/rate`; `EditTransactionDialog` seeds it.
- [x] Cost-basis sites use per-tx `exchange_rate` for cost, `dollarRate` for market value, with `>0` fallback:
      `Dashboard.tsx`, `PortfolioSummary.tsx`. (`GoalProgressCard.tsx` only uses current market value → no change. `TransactionPreview.tsx` is a pre-save preview of entered values → no change.)
- [x] `pages/Settings.tsx` + `/settings` route + ☰ menu link (USD rate, IOF buy/sell, backfill button).
- [x] `pages/QA.tsx` + `/qa` route + ☰ menu link (renders this file as markdown via react-markdown + remark-gfm).

---

## Resolved
- Settings page first-pass scope: **USD rate + IOF buy/sell + backfill now**; profile/name/preferences later.
- There is **no "point 3"** — it was never intended.

## Known approximations / future ideas
- Backfill applies the *current* IOF to old rows (historical IOF not tracked); FX dominates, and the per-transaction rate is editable for exact broker figures.
- Yahoo `USDBRL=X` close ≠ broker/PTAX rate exactly; edit per transaction for precision.
