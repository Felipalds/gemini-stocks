package statements

import "time"

// Bank identifiers returned by Detect / Parse.
const (
	BankUnknown = ""
	BankNubank  = "nubank"
	BankInter   = "inter"
)

// Kind classifies a parsed line for default preview selection.
const (
	KindPurchase    = "purchase"
	KindInstallment = "installment"
	KindPayment     = "payment"
	KindIOF         = "iof"
	KindInterest    = "interest"
	KindCashback    = "cashback"
	KindOther       = "other"
)

// Line is one statement entry ready for preview / insert.
type Line struct {
	Name            string    `json:"name"`
	OriginalName    string    `json:"original_name"`
	Category        string    `json:"category"`
	Date            time.Time `json:"date"`
	Value           float64   `json:"value"`
	Currency        string    `json:"currency"`
	Bank            string    `json:"bank"`
	PaymentType     string    `json:"payment_type"`
	Kind            string    `json:"kind"`
	Selected        bool      `json:"selected"`
	SkipReason      string    `json:"skip_reason,omitempty"`
	InstallmentN    int       `json:"installment_n,omitempty"`
	InstallmentOf   int       `json:"installment_of,omitempty"`
	ExternalKey     string    `json:"external_key"`
	AlreadyImported bool      `json:"already_imported"`
	HasAlias        bool      `json:"has_alias"`
}

// Preview is the response of POST /expenses/import (parse only).
type Preview struct {
	Bank     string `json:"bank"`
	Lines    []Line `json:"lines"`
	Warnings []string `json:"warnings"`
}
