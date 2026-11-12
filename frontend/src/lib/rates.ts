// Pure currency/rate helpers shared by the dashboard and portfolio summary.
// Kept free of React so they can be unit-tested in isolation.

export type CurrencyView = "BRL" | "USD";

/**
 * Rate to convert a transaction amount to BRL for MARKET value — always today's
 * rate for USD, 1 for BRL.
 */
export function marketRateBRL(currency: string, dollarRate: number): number {
  return currency.toUpperCase() === "USD" ? dollarRate : 1;
}

/**
 * Rate to convert COST to BRL — the purchase-day rate snapshotted on the
 * transaction, falling back to today's rate when it's missing/0 (so a legacy row
 * never multiplies by zero). 1 for BRL.
 */
export function costRateBRL(
  currency: string,
  exchangeRate: number | undefined,
  dollarRate: number,
): number {
  if (currency.toUpperCase() !== "USD") return 1;
  return exchangeRate && exchangeRate > 0 ? exchangeRate : dollarRate;
}

/** Convert a BRL amount to USD at the current rate; 0 when no rate is available. */
export function toUSD(brl: number, dollarRate: number): number {
  return dollarRate > 0 ? brl / dollarRate : 0;
}

/** PnL as a percentage of cost basis; 0 when there is no cost basis. */
export function pnlPercent(pnl: number, costBasis: number): number {
  return costBasis !== 0 ? (pnl / costBasis) * 100 : 0;
}
