package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Recurring values. Empty string means a one-off expense.
const (
	RecurringNone     = ""
	RecurringMonthly  = "monthly"
	RecurringAnnually = "annually"
)

// Bank / source identifiers for expenses.
const (
	BankManual = ""
	BankNubank = "nubank"
	BankInter  = "inter"
)

// PaymentType values.
const (
	PaymentTypeManual  = ""
	PaymentTypeCredit  = "credit"
	PaymentTypeDebit   = "debit"
	PaymentTypePix     = "pix"
	PaymentTypeMoney   = "money"
	PaymentTypeBitcoin = "bitcoin"
)

type Expense struct {
	gorm.Model
	ID            string    `gorm:"primaryKey" json:"ID"`
	Name          string    `json:"name"`
	Category      string    `json:"category" gorm:"index"`
	Value         float64   `json:"value"`
	Currency      string    `json:"currency" gorm:"default:BRL"`
	Date          time.Time `json:"date" gorm:"index"`
	Note          string    `json:"note"`
	Recurring     string    `json:"recurring" gorm:"default:''"`
	Bank          string    `json:"bank" gorm:"index;default:''"`
	PaymentType   string    `json:"payment_type" gorm:"index;default:''"`
	ImportBatchID string    `json:"import_batch_id" gorm:"index;default:''"`
	ExternalKey   string    `json:"external_key" gorm:"index;default:''"`
}

func (e *Expense) BeforeCreate(tx *gorm.DB) (err error) {
	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	return
}

// Budget is a monthly spending target. An empty Category means the overall
// monthly budget; a non-empty value scopes the budget to that category.
type Budget struct {
	gorm.Model
	ID        string  `gorm:"primaryKey" json:"ID"`
	Category  string  `json:"category" gorm:"index"`
	AmountBRL float64 `json:"amount_brl"`
}

func (b *Budget) BeforeCreate(tx *gorm.DB) (err error) {
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	return
}

// ExpenseCategory is a managed label for expenses. Renaming/deleting a row
// here never rewrites existing Expense.Category values.
type ExpenseCategory struct {
	gorm.Model
	ID   string `gorm:"primaryKey" json:"ID"`
	Name string `json:"name" gorm:"uniqueIndex;size:120"`
}

func (c *ExpenseCategory) BeforeCreate(tx *gorm.DB) (err error) {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return
}

// MerchantAlias maps a statement merchant name to a preferred display name
// (and optional default category). Does not mutate past expenses.
type MerchantAlias struct {
	gorm.Model
	ID           string `gorm:"primaryKey" json:"ID"`
	OriginalKey  string `json:"original_key" gorm:"uniqueIndex;size:255"`
	OriginalName string `json:"original_name"`
	Alias        string `json:"alias"`
	Category     string `json:"category" gorm:"default:''"`
}

func (m *MerchantAlias) BeforeCreate(tx *gorm.DB) (err error) {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	return
}
