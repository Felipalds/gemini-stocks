package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type ExpenseCategoryHandler struct {
	DB     *gorm.DB
	Logger *zap.SugaredLogger
}

func NewExpenseCategoryHandler(db *gorm.DB, logger *zap.SugaredLogger) *ExpenseCategoryHandler {
	return &ExpenseCategoryHandler{DB: db, Logger: logger}
}

func (h *ExpenseCategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	var rows []models.ExpenseCategory
	if err := h.DB.Order("name asc").Find(&rows).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows)
}

func (h *ExpenseCategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	row := models.ExpenseCategory{Name: name}
	if err := h.DB.Create(&row).Error; err != nil {
		if isUniqueViolation(err) {
			http.Error(w, "category already exists", http.StatusConflict)
			return
		}
		h.Logger.Error("Failed to create category", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(row)
}

func (h *ExpenseCategoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.ExpenseCategory
	if err := h.DB.First(&existing, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Category not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	// Rename master label only — do not cascade to Expense rows.
	existing.Name = name
	if err := h.DB.Save(&existing).Error; err != nil {
		if isUniqueViolation(err) {
			http.Error(w, "category already exists", http.StatusConflict)
			return
		}
		h.Logger.Error("Failed to update category", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

func (h *ExpenseCategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result := h.DB.Where("id = ?", id).Delete(&models.ExpenseCategory{})
	if result.Error != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		http.Error(w, "Category not found", http.StatusNotFound)
		return
	}
	// Soft-delete only the master row; Expense.Category strings are untouched.
	w.WriteHeader(http.StatusNoContent)
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "constraint")
}

// ensureCategoryExists inserts a master category if missing (by name).
func ensureCategoryExists(db *gorm.DB, name string) {
	name = strings.TrimSpace(name)
	if name == "" {
		return
	}
	var count int64
	db.Model(&models.ExpenseCategory{}).Where("name = ?", name).Count(&count)
	if count > 0 {
		return
	}
	_ = db.Create(&models.ExpenseCategory{Name: name}).Error
}

// upsertMerchantAlias creates or updates an alias mapping.
func upsertMerchantAlias(db *gorm.DB, originalName, alias, category string) {
	originalName = strings.TrimSpace(originalName)
	alias = strings.TrimSpace(alias)
	if originalName == "" || alias == "" {
		return
	}
	key := models.NormalizeMerchantKey(originalName)
	if key == "" {
		return
	}
	var existing models.MerchantAlias
	err := db.Where("original_key = ?", key).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		_ = db.Create(&models.MerchantAlias{
			OriginalKey:  key,
			OriginalName: originalName,
			Alias:        alias,
			Category:     strings.TrimSpace(category),
		}).Error
		return
	}
	if err != nil {
		return
	}
	existing.OriginalName = originalName
	existing.Alias = alias
	if strings.TrimSpace(category) != "" {
		existing.Category = strings.TrimSpace(category)
	}
	_ = db.Save(&existing).Error
}

// updateAliasCategoryOnly sets category on an existing alias without changing its name.
func updateAliasCategoryOnly(db *gorm.DB, originalName, category string) {
	category = strings.TrimSpace(category)
	if category == "" {
		return
	}
	key := models.NormalizeMerchantKey(originalName)
	if key == "" {
		return
	}
	var existing models.MerchantAlias
	if err := db.Where("original_key = ?", key).First(&existing).Error; err != nil {
		return
	}
	existing.Category = category
	_ = db.Save(&existing).Error
}
