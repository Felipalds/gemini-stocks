// Asset-class buckets used by the dashboard filter and the Total Portfolio summary.
// These are distinct from the free-text `category` field — they classify a holding
// by what it fundamentally is, derived from its symbol and currency.
export type AssetClass = "BRA" | "USA" | "CRYPTO" | "FIXA";

export const ASSET_CLASSES: AssetClass[] = ["BRA", "USA", "CRYPTO", "FIXA"];

// classifyAssetClass buckets a holding:
//   - fixed balances            -> FIXA
//   - crypto pairs (e.g. BTC/USD) -> CRYPTO
//   - positions held only in USD  -> USA
//   - everything else (BRL/mixed) -> BRA
export function classifyAssetClass(params: {
  symbol: string;
  isFixed?: boolean;
  isUsdOnly: boolean;
}): AssetClass {
  if (params.isFixed) return "FIXA";
  if (params.symbol.includes("/")) return "CRYPTO";
  return params.isUsdOnly ? "USA" : "BRA";
}
