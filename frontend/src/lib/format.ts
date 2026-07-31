export function formatCurrency(val: number, currency: string = "USD"): string {
  if (currency === "BRL") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(val);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(val);
}

/** Round quantity to at most `maxDecimals` places (default 5) and trim trailing zeros. */
export function formatQuantity(val: number, maxDecimals = 5): string {
  if (!Number.isFinite(val)) return String(val);
  return String(Number(val.toFixed(maxDecimals)));
}

