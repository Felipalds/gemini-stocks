package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type TransactionType string

const (
	Buy  TransactionType = "BUY"
	Sell TransactionType = "SELL"
)

type Transaction struct {
	gorm.Model
	ID       string          `gorm:"primaryKey" json:"ID"`
	Symbol   string          `json:"symbol" gorm:"index"`
	Type     TransactionType `json:"type"`
	Quantity float32         `json:"quantity"`
	Price    float64         `json:"price"`
	Currency string          `json:"currency" gorm:"default:USD"`
	Fee      float64         `json:"fee" gorm:"default:0"`
	Date     time.Time       `json:"date"`
	Note     string          `json:"note"`
	// ExchangeRate is the effective all-in rate (FX + IOF) from the transaction's
	// Currency to BRL, snapshotted at creation from the purchase-day rate. It is
	// 1 for BRL transactions. A value of 0 means "not set" (e.g. a legacy row not
	// yet backfilled) and callers must fall back to the current rate — never
	// multiply by 0. See POST /transactions/backfill-rates.
	ExchangeRate float64 `json:"exchange_rate" gorm:"default:0"`
}

func (t *Transaction) BeforeCreate(tx *gorm.DB) (err error) {
	// Se não vier ID, gera um novo UUID v4
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return
}
