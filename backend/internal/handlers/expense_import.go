package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/statements"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

const maxStatementUpload = 10 << 20 // 10 MB

// ImportPreview handles POST /expenses/import
// multipart: file (PDF), optional bank=auto|nubank|inter
func (h *ExpenseHandler) ImportPreview(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxStatementUpload); err != nil {
		http.Error(w, "Invalid multipart form (max 10MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > maxStatementUpload {
		http.Error(w, "file too large", http.StatusBadRequest)
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, maxStatementUpload+1))
	if err != nil {
		http.Error(w, "failed to read file", http.StatusBadRequest)
		return
	}
	if len(data) > maxStatementUpload {
		http.Error(w, "file too large", http.StatusBadRequest)
		return
	}

	bank := r.FormValue("bank")
	if bank == "" {
		bank = "auto"
	}

	preview, err := statements.ParsePDFBytes(data, bank)
	if err != nil {
		h.Logger.Warnw("statement parse failed", "err", err, "bank", bank)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Load aliases once and apply suggestions (name + default category).
	var aliases []models.MerchantAlias
	_ = h.DB.Find(&aliases).Error
	aliasByKey := map[string]models.MerchantAlias{}
	for _, a := range aliases {
		aliasByKey[a.OriginalKey] = a
	}
	for i := range preview.Lines {
		orig := preview.Lines[i].OriginalName
		if orig == "" {
			orig = preview.Lines[i].Name
			preview.Lines[i].OriginalName = orig
		}
		if a, ok := aliasByKey[models.NormalizeMerchantKey(orig)]; ok {
			preview.Lines[i].Name = a.Alias
			preview.Lines[i].HasAlias = true
			if a.Category != "" {
				preview.Lines[i].Category = a.Category
			}
		}
	}

	// Mark rows that were already imported (same external_key).
	keys := make([]string, 0, len(preview.Lines))
	for _, l := range preview.Lines {
		if l.ExternalKey != "" {
			keys = append(keys, l.ExternalKey)
		}
	}
	existing := map[string]bool{}
	if len(keys) > 0 {
		var rows []models.Expense
		if err := h.DB.Select("external_key").Where("external_key IN ?", keys).Find(&rows).Error; err != nil {
			h.Logger.Error("Failed to check duplicate expenses", zap.Error(err))
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		for _, row := range rows {
			existing[row.ExternalKey] = true
		}
	}
	for i := range preview.Lines {
		if existing[preview.Lines[i].ExternalKey] {
			preview.Lines[i].AlreadyImported = true
			preview.Lines[i].Selected = false
			if preview.Lines[i].SkipReason == "" {
				preview.Lines[i].SkipReason = "already imported"
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(preview)
}

type importConfirmItem struct {
	Name          string  `json:"name"`
	OriginalName  string  `json:"original_name"`
	Category      string  `json:"category"`
	Date          string  `json:"date"`
	Value         float64 `json:"value"`
	Currency      string  `json:"currency"`
	Bank          string  `json:"bank"`
	PaymentType   string  `json:"payment_type"`
	ExternalKey   string  `json:"external_key"`
	InstallmentN  int     `json:"installment_n"`
	InstallmentOf int     `json:"installment_of"`
	Note          string  `json:"note"`
	SaveAlias     *bool   `json:"save_alias"`
}

type importConfirmRequest struct {
	Bank  string              `json:"bank"`
	Items []importConfirmItem `json:"items"`
}

type importConfirmResult struct {
	ImportBatchID string `json:"import_batch_id"`
	Imported      int    `json:"imported"`
	Skipped       int    `json:"skipped"`
}

// ImportConfirm handles POST /expenses/import/confirm
func (h *ExpenseHandler) ImportConfirm(w http.ResponseWriter, r *http.Request) {
	var req importConfirmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	if len(req.Items) == 0 {
		http.Error(w, "items is required", http.StatusBadRequest)
		return
	}

	batchID := uuid.New().String()
	result := importConfirmResult{ImportBatchID: batchID}

	for _, item := range req.Items {
		if item.Name == "" || item.Value <= 0 {
			result.Skipped++
			continue
		}
		if item.ExternalKey != "" {
			var count int64
			h.DB.Model(&models.Expense{}).Where("external_key = ?", item.ExternalKey).Count(&count)
			if count > 0 {
				result.Skipped++
				continue
			}
		}

		date := time.Now()
		if item.Date != "" {
			if t, err := time.Parse(time.RFC3339, item.Date); err == nil {
				date = t
			} else if t, err := time.Parse("2006-01-02", item.Date); err == nil {
				date = t
			}
		}
		currency := item.Currency
		if currency == "" {
			currency = "BRL"
		}
		bank := item.Bank
		if bank == "" {
			bank = req.Bank
		}
		paymentType := item.PaymentType
		if paymentType == "" {
			paymentType = models.PaymentTypeCredit
		}
		category := strings.TrimSpace(item.Category)
		original := strings.TrimSpace(item.OriginalName)
		if original == "" {
			original = item.Name
		}

		e := models.Expense{
			Name:          item.Name,
			Category:      category,
			Value:         item.Value,
			Currency:      currency,
			Date:          date,
			Note:          item.Note,
			Recurring:     models.RecurringNone,
			Bank:          bank,
			PaymentType:   paymentType,
			ImportBatchID: batchID,
			ExternalKey:   item.ExternalKey,
		}
		if err := h.DB.Create(&e).Error; err != nil {
			h.Logger.Error("Failed to import expense", zap.Error(err))
			result.Skipped++
			continue
		}
		result.Imported++

		ensureCategoryExists(h.DB, category)

		saveAlias := true
		if item.SaveAlias != nil {
			saveAlias = *item.SaveAlias
		}
		if saveAlias && item.Name != original {
			upsertMerchantAlias(h.DB, original, item.Name, category)
		} else if category != "" {
			updateAliasCategoryOnly(h.DB, original, category)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
