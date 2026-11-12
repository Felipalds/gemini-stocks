import { describe, it, expect } from "vitest";
import { marketRateBRL, costRateBRL, toUSD, pnlPercent } from "./rates";

describe("marketRateBRL", () => {
  it("uses the dollar rate for USD", () => {
    expect(marketRateBRL("USD", 5.3)).toBe(5.3);
    expect(marketRateBRL("usd", 5.3)).toBe(5.3);
  });
  it("is 1 for BRL", () => {
    expect(marketRateBRL("BRL", 5.3)).toBe(1);
  });
});

describe("costRateBRL", () => {
  it("uses the snapshotted purchase-day rate when present", () => {
    expect(costRateBRL("USD", 5.0, 5.3)).toBe(5.0);
  });
  it("falls back to today's rate when exchange_rate is missing or 0", () => {
    expect(costRateBRL("USD", undefined, 5.3)).toBe(5.3);
    expect(costRateBRL("USD", 0, 5.3)).toBe(5.3);
    expect(costRateBRL("USD", -1, 5.3)).toBe(5.3);
  });
  it("is 1 for BRL regardless of exchange_rate", () => {
    expect(costRateBRL("BRL", 5.0, 5.3)).toBe(1);
  });
});

describe("toUSD", () => {
  it("divides by the current rate", () => {
    expect(toUSD(530, 5.3)).toBe(100);
  });
  it("returns 0 when no rate", () => {
    expect(toUSD(530, 0)).toBe(0);
    expect(toUSD(530, -1)).toBe(0);
  });
});

describe("pnlPercent", () => {
  it("computes percent of cost basis", () => {
    expect(pnlPercent(20, 100)).toBe(20);
    expect(pnlPercent(-50, 200)).toBe(-25);
  });
  it("is 0 when cost basis is 0", () => {
    expect(pnlPercent(20, 0)).toBe(0);
  });
});

describe("FX-aware cost vs market (integration of helpers)", () => {
  it("surfaces an FX gain when the dollar rose since purchase", () => {
    // Bought 10 units @ $100 when USD=5.00; today USD=5.50, price unchanged.
    const qty = 10;
    const price = 100;
    const buyRate = 5.0;
    const todayRate = 5.5;
    const costBRL = qty * price * costRateBRL("USD", buyRate, todayRate);
    const marketBRL = qty * price * marketRateBRL("USD", todayRate);
    expect(costBRL).toBe(5000);
    expect(marketBRL).toBe(5500);
    expect(marketBRL - costBRL).toBe(500); // pure FX gain in BRL
  });
});
