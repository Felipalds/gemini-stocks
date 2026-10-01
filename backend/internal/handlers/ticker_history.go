package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/services"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TickerHistoryHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

func NewTickerHistoryHandler(db *gorm.DB, logger *zap.SugaredLogger, finance *services.FinanceService) *TickerHistoryHandler {
	return &TickerHistoryHandler{DB: db, Logger: logger, Finance: finance}
}

// GetHistory handles GET /tickers/history?symbol=BTC/USD
// Returns the stored monthly series ascending by date — always from our DB,
// never calling Yahoo. Symbol is a query param (not a path segment) so pairs
// like BTC/USD survive — Chi leaves %2F undecoded in path params.
func (h *TickerHistoryHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	if symbol == "" {
		http.Error(w, "Symbol is required (query param: symbol)", http.StatusBadRequest)
		return
	}

	var rows []models.TickerHistory
	if err := h.DB.Where("symbol = ?", symbol).Order("date asc").Find(&rows).Error; err != nil {
		h.Logger.Error("Failed to fetch ticker history", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []models.TickerHistory{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows)
}

// SyncHistory handles POST /tickers/history/sync?symbol=BTC/USD[&force=1]
// Fetches the full monthly series from Yahoo and upserts only the periods we
// don't already have (the diff). If the latest stored period is already the
// current month, it skips the Yahoo call entirely unless force=1.
func (h *TickerHistoryHandler) SyncHistory(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	if symbol == "" {
		http.Error(w, "Symbol is required (query param: symbol)", http.StatusBadRequest)
		return
	}
	if models.IsLegacyFixedSymbol(symbol) {
		http.Error(w, "Fixed balances have no market history", http.StatusBadRequest)
		return
	}
	force := r.URL.Query().Get("force") == "1"

	// Use the cached ticker's currency to build the right Yahoo symbol (.SA etc.).
	currency := "USD"
	var ticker models.Ticker
	if err := h.DB.First(&ticker, "symbol = ?", symbol).Error; err == nil && ticker.Currency != "" {
		currency = ticker.Currency
	}

	currentPeriod := time.Now().UTC().Format("2006-01")

	// Latest stored period drives both the skip-guard and the diff cutoff.
	latestStored := ""
	var latest models.TickerHistory
	if err := h.DB.Where("symbol = ?", symbol).Order("period desc").First(&latest).Error; err == nil {
		latestStored = latest.Period
	}

	// Skip-guard: if we already hold the current (still-forming) month, there is
	// nothing new to fetch — serve from the DB without touching Yahoo.
	if !force && latestStored >= currentPeriod {
		h.Logger.Infof("Skipping history sync for %s — already have current period %s", symbol, latestStored)
		h.respondSync(w, symbol, 0, true)
		return
	}

	history, err := h.Finance.FetchMonthlyHistory(symbol, currency)
	if err != nil {
		h.Logger.Warnf("Failed to fetch history for %s: %v", symbol, err)
		http.Error(w, "Failed to fetch history from Yahoo Finance", http.StatusBadGateway)
		return
	}

	// Upsert the diff: periods at or after the latest we already stored. On a
	// first sync latestStored is "" so every row is written; later syncs only
	// rewrite the last (possibly still-forming) month and append newer ones.
	synced := 0
	for _, row := range history {
		if row.Period < latestStored {
			continue
		}
		row.Symbol = symbol
		if err := h.DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "symbol"}, {Name: "period"}},
			DoUpdates: clause.AssignmentColumns([]string{"date", "close", "currency"}),
		}).Create(&row).Error; err != nil {
			h.Logger.Warnf("Failed to upsert history row %s %s: %v", symbol, row.Period, err)
			continue
		}
		synced++
	}

	h.Logger.Infof("History sync for %s: upserted %d period(s) (series length %d)", symbol, synced, len(history))
	h.respondSync(w, symbol, synced, false)
}

func (h *TickerHistoryHandler) respondSync(w http.ResponseWriter, symbol string, synced int, skipped bool) {
	var total int64
	h.DB.Model(&models.TickerHistory{}).Where("symbol = ?", symbol).Count(&total)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"symbol":  symbol,
		"synced":  synced,
		"skipped": skipped,
		"total":   total,
	})
}
