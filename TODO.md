# TODO — deferred features

Tracked here so we don't lose them. Move into a sized ticket when picking
one up.

## Expenses / Budgets
- **Forecast end-of-month spend** — extrapolate from rolling daily average
  and compare against active budget. (Section "Suggestions" #8 in
  `EXPENSES.md`.)
- **Recurring auto-detection** — flag patterns like "same name + similar
  value every ~30 days" as candidates to convert into a `recurring:
  monthly` expense. (Manual recurring already ships.)
- **Budget management UI** — frontend page to create / edit budgets per
  category. Backend CRUD already exists.
- **Weekday spend pattern** — "you spend 2× on Saturdays". Cheap to add
  on the backend, was not prioritised in v1.
- **Historical FX rates** — recurring expenses currently convert at the
  latest cached rate. Storing the rate at the time of each instance
  would make older totals more accurate.
- **CSV / Excel expense import** — analogous to the existing transaction
  importer.

## Stocks
- Wire `GET /data/summary` — handler is declared but empty.
- Background worker for periodic price refresh (README claims this exists;
  it does not).
