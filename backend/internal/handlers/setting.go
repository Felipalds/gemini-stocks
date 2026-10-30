package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// settingsID is the fixed primary key of the singleton settings row.
const settingsID = 1

type SettingHandler struct {
	DB     *gorm.DB
	Logger *zap.SugaredLogger
}

func NewSettingHandler(db *gorm.DB, logger *zap.SugaredLogger) *SettingHandler {
	return &SettingHandler{DB: db, Logger: logger}
}

// GetSettings returns the singleton settings row, creating it with zero defaults
// on first access. It never returns an error to callers — a missing/broken row
// falls back to a zero-value Setting (IOF 0), which is a safe no-op.
func GetSettings(db *gorm.DB) models.Setting {
	var s models.Setting
	if err := db.First(&s, settingsID).Error; err != nil {
		s = models.Setting{ID: settingsID, UpdatedAt: time.Now()}
		db.Create(&s)
	}
	return s
}

// Get handles GET /settings
func (h *SettingHandler) Get(w http.ResponseWriter, r *http.Request) {
	s := GetSettings(h.DB)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

// Update handles PUT /settings
func (h *SettingHandler) Update(w http.ResponseWriter, r *http.Request) {
	var body models.Setting
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.Logger.Error("Failed to decode settings body", zap.Error(err))
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	s := GetSettings(h.DB)
	s.IOFBuyRate = body.IOFBuyRate
	s.IOFSellRate = body.IOFSellRate
	s.UpdatedAt = time.Now()

	if err := h.DB.Save(&s).Error; err != nil {
		h.Logger.Error("Failed to save settings", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}
