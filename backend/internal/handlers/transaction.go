package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/services"
	"github.com/go-chi/chi/v5"
	"github.com/xuri/excelize/v2"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type ImportRowError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type ImportResult struct {
	Imported int              `json:"imported"`
	Failed   int              `json:"failed"`
	Errors   []ImportRowError `json:"errors"`
}

// TransactionHandler holds dependencies for transaction logic
type TransactionHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

type TransactionResponse struct {
	models.Transaction
	CurrentPrice float64 `json:"current_price"` // Explicit JSON tag
	MarketValue  float64 `json:"market_value"`
	PnL          float64 `json:"pnl"`
	PnLPercent   float64 `json:"pnl_percent"`
}

// NewTransactionHandler is the constructor
func NewTransactionHandler(db *gorm.DB, logger *zap.SugaredLogger, financeService *services.FinanceService) *TransactionHandler {
	return &TransactionHandler{
		DB:      db,
		Logger:  logger,
		Finance: financeService,
	}
}

// ensureStockExists checks if a ticker exists in stock_prices; if not, creates it and fetches the price.
func (h *TransactionHandler) ensureStockExists(symbol, currency string) {
	var stock models.StockPrice
	if err := h.DB.First(&stock, "symbol = ?", symbol).Error; err != nil {
		h.Logger.Infof("New stock symbol detected: %s. Fetching initial price...", symbol)

		currentPrice, err := h.Finance.GetPriceFromAPI(symbol)
		if err != nil {
			h.Logger.Warn("Could not fetch initial price from API", zap.Error(err))
			currentPrice = 0
		}

		newStock := models.StockPrice{
			Symbol:   symbol,
			Price:    currentPrice,
			Currency: currency,
		}
		if err := h.DB.Create(&newStock).Error; err != nil {
			h.Logger.Error("Failed to save new stock ticker", zap.Error(err))
		}
	}
}

// Create handles POST /transactions
func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var tx models.Transaction

	// 1. Decode JSON Body
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		h.Logger.Error("Failed to decode JSON body", zap.Error(err))
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// 2. Basic Validation
	if tx.Symbol == "" || tx.Quantity <= 0 || tx.Price <= 0 {
		http.Error(w, "Symbol, quantity, and price are required", http.StatusBadRequest)
		return
	}

	// Default currency to USD if not provided
	if tx.Currency == "" {
		tx.Currency = "USD"
	}

	// 3. Ensure the Stock Ticker exists in our Price Cache table
	h.ensureStockExists(tx.Symbol, tx.Currency)

	// 4. Save Transaction to Database
	if err := h.DB.Create(&tx).Error; err != nil {
		h.Logger.Error("Failed to create transaction in DB", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infow("Transaction created successfully",
		"symbol", tx.Symbol,
		"type", tx.Type,
		"id", tx.ID,
	)

	// 5. Return Response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

// GetAll handles GET /transactions
// Complexity: O(N) - Linear time, very fast.
func (h *TransactionHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	// 1. Fetch ALL transactions (Query #1)
	var transactions []models.Transaction
	if err := h.DB.Find(&transactions).Error; err != nil {
		h.Logger.Error("Failed to fetch transactions", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// 2. Fetch ALL cached prices (Query #2)
	// We get everything in one shot instead of querying inside the loop
	var stockPrices []models.StockPrice
	if err := h.DB.Find(&stockPrices).Error; err != nil {
		h.Logger.Warn("Failed to fetch stock prices", zap.Error(err))
		// We continue; we just won't have price data
	}

	// 3. Create a Lookup Map (O(M))
	// This allows O(1) access time later
	priceMap := make(map[string]float64)
	for _, s := range stockPrices {
		priceMap[s.Symbol] = s.Price
	}

	// 4. Merge Data (O(N))
	var response []TransactionResponse
	for _, t := range transactions {
		// O(1) Lookup
		currentPrice := priceMap[t.Symbol]

		// Calculate PnL
		marketValue := 0.0
		pnl := 0.0
		pnlPercent := 0.0

		// Only calculate if we have a valid price > 0
		if currentPrice > 0 {
			marketValue = currentPrice * float64(t.Quantity)
			costBasis := t.Price * float64(t.Quantity)
			pnl = marketValue - costBasis - t.Fee

			if costBasis > 0 {
				pnlPercent = (pnl / costBasis) * 100
			}
		}

		response = append(response, TransactionResponse{
			Transaction:  t,
			CurrentPrice: currentPrice,
			MarketValue:  marketValue,
			PnL:          pnl,
			PnLPercent:   pnlPercent,
		})
	}

	// 5. Return JSON
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Update handles PUT /transactions/{id}
func (h *TransactionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 1. Find existing transaction
	var existing models.Transaction
	if err := h.DB.First(&existing, "id = ?", id).Error; err != nil {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	// 2. Decode request body
	var body models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.Logger.Error("Failed to decode JSON body", zap.Error(err))
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// 3. Update fields
	existing.Symbol = body.Symbol
	existing.Type = body.Type
	existing.Quantity = body.Quantity
	existing.Price = body.Price
	existing.Fee = body.Fee
	existing.Currency = body.Currency
	existing.Date = body.Date
	existing.Note = body.Note

	if existing.Currency == "" {
		existing.Currency = "USD"
	}

	// 4. Save
	if err := h.DB.Save(&existing).Error; err != nil {
		h.Logger.Error("Failed to update transaction", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infof("Transaction %s updated successfully", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

// ImportExcel handles POST /transactions/import
func (h *TransactionHandler) ImportExcel(w http.ResponseWriter, r *http.Request) {
	// 1. Parse multipart form (10MB limit)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "File too large or invalid form", http.StatusBadRequest)
		return
	}

	symbol := strings.TrimSpace(strings.ToUpper(r.FormValue("symbol")))
	currency := strings.TrimSpace(strings.ToUpper(r.FormValue("currency")))

	if symbol == "" {
		http.Error(w, "Symbol is required", http.StatusBadRequest)
		return
	}
	if currency == "" {
		currency = "USD"
	}

	// 2. Get the uploaded file
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "File is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 3. Open with excelize
	f, err := excelize.OpenReader(file)
	if err != nil {
		http.Error(w, "Invalid Excel file", http.StatusBadRequest)
		return
	}
	defer f.Close()

	// 4. Ensure ticker exists (reuse shared logic)
	h.ensureStockExists(symbol, currency)

	// 5. Read rows from the first sheet
	sheetName := f.GetSheetName(0)
	rows, err := f.GetRows(sheetName)
	if err != nil {
		http.Error(w, "Could not read spreadsheet", http.StatusBadRequest)
		return
	}

	result := ImportResult{}

	for i, row := range rows {
		// Skip header row
		if i == 0 {
			continue
		}
		rowNum := i + 1 // 1-based for user-friendly error messages

		if len(row) < 4 {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNum,
				Message: fmt.Sprintf("Expected 4 columns (Date, Quantity, Price, Fee), got %d", len(row)),
			})
			continue
		}

		// Parse Date (YYYY-MM-DD)
		date, err := time.Parse("2006-01-02", strings.TrimSpace(row[0]))
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNum,
				Message: fmt.Sprintf("Invalid date '%s'. Expected format: YYYY-MM-DD", row[0]),
			})
			continue
		}

		// Parse Quantity (float)
		quantity, err := strconv.ParseFloat(strings.TrimSpace(row[1]), 32)
		if err != nil || quantity <= 0 {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNum,
				Message: fmt.Sprintf("Invalid quantity '%s'. Must be a positive number", row[1]),
			})
			continue
		}

		// Parse Price (float)
		price, err := strconv.ParseFloat(strings.TrimSpace(row[2]), 64)
		if err != nil || price <= 0 {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNum,
				Message: fmt.Sprintf("Invalid price '%s'. Must be a positive number", row[2]),
			})
			continue
		}

		// Parse Fee (float)
		fee, err := strconv.ParseFloat(strings.TrimSpace(row[3]), 64)
		if err != nil || fee < 0 {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNum,
				Message: fmt.Sprintf("Invalid fee '%s'. Must be a non-negative number", row[3]),
			})
			continue
		}

		tx := models.Transaction{
			Symbol:   symbol,
			Type:     models.Buy,
			Quantity: float32(quantity),
			Price:    price,
			Fee:      fee,
			Currency: currency,
			Date:     date,
		}

		if err := h.DB.Create(&tx).Error; err != nil {
			result.Failed++
			result.Errors = append(result.Errors, ImportRowError{
				Row:     rowNum,
				Message: "Database error saving transaction",
			})
			continue
		}

		result.Imported++
	}

	h.Logger.Infof("Excel import for %s: %d imported, %d failed", symbol, result.Imported, result.Failed)

	w.Header().Set("Content-Type", "application/json")
	if result.Imported == 0 && result.Failed > 0 {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(result)
}

// Delete handles DELETE /transactions/{id}
func (h *TransactionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Correção: Usar .Where("id = ?", id) explicitamente
	// Isso garante que o GORM nunca tente rodar um DELETE sem cláusula WHERE
	result := h.DB.Where("id = ?", id).Delete(&models.Transaction{})

	if result.Error != nil {
		h.Logger.Error("Failed to delete transaction", zap.Error(result.Error))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	if result.RowsAffected == 0 {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	h.Logger.Infof("Transaction %s deleted successfully", id)
	w.WriteHeader(http.StatusNoContent) // 204 No Content
}
