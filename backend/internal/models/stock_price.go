package models

import (
	"time"
)

// StockPrice acts as a cache for the latest market price
type StockPrice struct {
	Symbol    string    `gorm:"primaryKey" json:"symbol"`
	Price     float64   `json:"price"`
	Tags      string    `json:"tags"`
	Category  string    `json:"category"`
	Currency  string    `json:"currency" gorm:"default:USD"`
	UpdatedAt time.Time `json:"updated_at"`
}
