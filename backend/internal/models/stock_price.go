package models

import (
	"time"
)

// StockPrice acts as a cache for the latest market price
type StockPrice struct {
	Symbol    string    `gorm:"primaryKey" json:"symbol"`
	Price     float64   `json:"price"`
	UpdatedAt time.Time `json:"updated_at"`
}
