package handlers

import "strings"

// normalizeCurrency upper-cases a currency code and defaults empty to USD,
// matching the server-side default applied to transactions and tickers.
func normalizeCurrency(code string) string {
	c := strings.ToUpper(strings.TrimSpace(code))
	if c == "" {
		return "USD"
	}
	return c
}

// convertPrice converts an amount expressed in `from` currency into `to`
// currency using the USD->BRL rate (e.g. usdBrlRate = 5.50 means 1 USD = 5.50 BRL).
//
// Only the USD<->BRL pair is supported, which is the only conversion the app
// performs. When the pair is unknown (or the rate is missing), the amount is
// returned unchanged so callers never produce a nonsensical zero/inflated value.
func convertPrice(amount float64, from, to string, usdBrlRate float64) float64 {
	from = normalizeCurrency(from)
	to = normalizeCurrency(to)

	if from == to {
		return amount
	}
	if usdBrlRate <= 0 {
		return amount
	}

	switch {
	case from == "USD" && to == "BRL":
		return amount * usdBrlRate
	case from == "BRL" && to == "USD":
		return amount / usdBrlRate
	default:
		// Unsupported pair (e.g. involving BTC as a quote currency): leave as-is.
		return amount
	}
}
