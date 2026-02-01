package handlers

import (
	"net/http"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/services"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type PriceHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

func NewPriceHandler(db *gorm.DB, logger *zap.SugaredLogger, finance *services.FinanceService) *PriceHandler {
	return &PriceHandler{
		DB:      db,
		Logger:  logger,
		Finance: finance,
	}
}

// RefreshPrices handles POST /prices/refresh
// It iterates over all known stocks and updates their prices from the API
func (h *PriceHandler) RefreshPrices(w http.ResponseWriter, r *http.Request) {
	h.Logger.Info("Starting manual price update...")

	// 1. Get all unique stocks from the StockPrice table
	var stocks []models.StockPrice
	if err := h.DB.Find(&stocks).Error; err != nil {
		h.Logger.Error("Failed to fetch stocks", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// 2. Iterate and Update
	updatedCount := 0
	for _, stock := range stocks {
		// Call your existing finance service
		newPrice, err := h.Finance.GetPriceFromAPI(stock.Symbol)
		if err != nil {
			h.Logger.Warnf("Failed to update %s: %v", stock.Symbol, err)
			continue
		}

		// Update DB
		stock.Price = newPrice
		h.DB.Save(&stock)
		updatedCount++

		// IMPORTANT: Sleep to respect API rate limits (8 requests/minute on free tier)
		time.Sleep(8 * time.Second)
	}

	h.Logger.Infof("Updated %d stocks successfully", updatedCount)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Prices updated successfully"))
}
