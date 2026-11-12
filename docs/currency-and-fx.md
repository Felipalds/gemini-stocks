# Currency, FX cost & the BRL⇄USD view

How the app records the **real BRL cost** of foreign-currency trades and lets you
view the portfolio in either currency.

> This is reference documentation. The design rationale and Q&A history live in
> [`Q&A.md`](./Q&A.md).

## Why

A US (or BTC-in-USD) purchase used to store only the USD price. BRL figures were
reconstructed at **today's** rate, so the reais you actually paid — and the
currency (FX) gain — were lost. Now every transaction stores the **effective rate
actually paid** on its purchase date, and the dashboard can be viewed in BRL
(FX-aware) or USD (per-asset).

## Concepts

- **Purchase-day rate** — the USD→BRL rate on the transaction's date (Yahoo
  `USDBRL=X`, the close on/before that day), fetched once and **snapshotted** on
  the transaction.
- **IOF** — Brazil's FX tax, added on top of the market rate. Configurable, with
  **different buy and sell** rates. Because it's snapshotted at write time,
  changing IOF later only affects **future** transactions.
- **Effective rate** = `market × (1 + IOF)`, stored as `Transaction.exchange_rate`
  (`1` for BRL; `0` = unset → callers fall back to the current rate, never ×0).
- **Currency view** — a display toggle. **BRL** uses the historical rate for cost
  (FX gain visible); **USD** shows each asset in dollars (USD-native assets have a
  pure-USD PnL; BRL/mixed assets convert at today's rate).

## Data model

| Field | Type | Meaning |
|---|---|---|
| `Transaction.ExchangeRate` | `float64` (`exchange_rate`) | Effective FX+IOF rate to BRL; `1` for BRL; `0` = unset |
| `Setting.IOFBuyRate` | `float64` (fraction, `0.0038` = 0.38%) | IOF applied to buys |
| `Setting.IOFSellRate` | `float64` | IOF applied to sells |

`Setting` is a singleton row (id = 1), created on first access.

## API

| Method & path | Purpose |
|---|---|
| `GET /settings` | Read IOF settings |
| `PUT /settings` | Update IOF buy/sell |
| `GET /currencies/rate?from=USD&date=YYYY-MM-DD&type=BUY` | `{market, iof, rate}` for the given date — used to auto-fill the form |
| `PUT /currencies/usd` | Manually set the current USD→BRL rate (`{ "rate": 5.3 }`) |
| `POST /transactions/backfill-rates` | Fill `exchange_rate` on rows that don't have one (idempotent) |

`POST`/`PUT /transactions` accept an optional `exchange_rate`; when omitted the
server computes it from the date (`computeExchangeRate`).

## How cost vs. market value is computed

- **Market value** (what it's worth now) → **today's** rate.
- **Cost basis** → the transaction's stored `exchange_rate` (fallback to today's
  rate when `0`).
- So **PnL in BRL includes the FX gain**; PnL in USD (USD-native assets) does not.

Backend helpers: `services.pickHistoricalClose`, `handlers.IOFFor`,
`handlers.EffectiveRate`, `handlers.computeExchangeRate`.
Frontend helpers: `src/lib/rates.ts` (`marketRateBRL`, `costRateBRL`, `toUSD`,
`pnlPercent`), consumed by `Dashboard.tsx` and `PortfolioSummary.tsx`.

## Frontend UI

- **Transaction form** — USD transactions show an editable "USD → BRL rate
  (incl. IOF)" field, auto-filled from the date; edit it to match a broker note.
- **Currency toggle** — a `R$`/`$` button in the header flips the whole dashboard;
  each square has its own override button and shows a secondary line in the other
  currency.
- **Settings page** (☰ menu) — USD rate, IOF buy/sell, and a backfill button.

## Usage

1. Restart the backend (migration + new routes).
2. **Settings → IOF**: set your buy/sell percentages.
3. **Settings → Run backfill** (fills historical rates on existing rows).
4. Edit individual transactions against broker notes for exact figures.

## Testing

```bash
# backend
cd backend && go test ./...

# frontend
cd frontend && npm test
```

Covered: `pickHistoricalClose` (date selection, weekend/holiday fallback, ragged
input), `IOFFor` / `EffectiveRate`, `GetSettings` singleton, and the `rates.ts`
helpers (incl. an FX-gain scenario).

## Known approximations

- Backfill applies the **current** IOF to old rows (historical IOF isn't tracked);
  FX dominates, and per-transaction rates are editable.
- Yahoo's `USDBRL=X` close ≠ your broker/PTAX rate exactly — edit per transaction
  for precision.
