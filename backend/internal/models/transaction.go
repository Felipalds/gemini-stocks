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
}

func (t *Transaction) BeforeCreate(tx *gorm.DB) (err error) {
	// Se não vier ID, gera um novo UUID v4
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return
}
