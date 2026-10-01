package models

import "time"

// TickerHistory stores one close price per period for a ticker, in the ticker's
// native currency. The composite primary key (symbol, period) dedupes rows and
// makes upserts clean — a resync overwrites the current period and appends new
// ones instead of duplicating.
type TickerHistory struct {
	Symbol    string    `gorm:"primaryKey" json:"symbol"`
	Period    string    `gorm:"primaryKey" json:"period"` // YYYY-MM (monthly granularity)
	Date      time.Time `json:"date"`                     // first day of the period, for sorting/plotting
	Close     float64   `json:"close"`                    // closing price in the native currency
	Currency  string    `json:"currency"`                 // native currency the price is quoted in
	CreatedAt time.Time `json:"created_at"`
}

// TableName keeps the table named history_tickers (matches the design doc)
// instead of GORM's default ticker_histories.
func (TickerHistory) TableName() string {
	return "history_tickers"
}
