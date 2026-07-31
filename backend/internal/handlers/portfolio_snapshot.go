package handlers

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type PortfolioSnapshotHandler struct {
	DB     *gorm.DB
	Logger *zap.SugaredLogger
}

func NewPortfolioSnapshotHandler(db *gorm.DB, logger *zap.SugaredLogger) *PortfolioSnapshotHandler {
	return &PortfolioSnapshotHandler{DB: db, Logger: logger}
}

// snapshotCreateMu serializes Create so React Strict Mode / double mounts
// cannot race two inserts for the same day.
var snapshotCreateMu sync.Mutex

func localDayRange(now time.Time) (time.Time, time.Time) {
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	return start, start.Add(24 * time.Hour)
}

// findSnapshotForLocalDay returns today's snapshot if one exists (non-deleted).
func (h *PortfolioSnapshotHandler) findSnapshotForLocalDay(now time.Time) (*models.PortfolioSnapshot, error) {
	start, end := localDayRange(now)
	var existing models.PortfolioSnapshot
	err := h.DB.Where("created_at >= ? AND created_at < ?", start, end).
		Order("created_at asc").
		First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &existing, nil
}

type snapshotHolding struct {
	Symbol   string  `json:"symbol"`
	ValueBRL float64 `json:"value_brl"`
	Category string  `json:"category"`
	Kind     string  `json:"kind"` // ticker | fixed
}

type portfolioTotals struct {
	TotalValueBRL float64
	TotalValueUSD float64
	TotalPnlBRL   float64
	DollarRate    float64
	Holdings      []snapshotHolding
}

func (h *PortfolioSnapshotHandler) computeTotals() (portfolioTotals, error) {
	var out portfolioTotals

	var currency models.Currency
	rate := 5.5
	if err := h.DB.First(&currency, "code = ?", "USD").Error; err == nil && currency.Rate > 0 {
		rate = currency.Rate
	}
	out.DollarRate = rate

	var prices []models.Ticker
	if err := h.DB.Find(&prices).Error; err != nil {
		return out, err
	}
	priceMap := make(map[string]models.Ticker, len(prices))
	for _, p := range prices {
		priceMap[p.Symbol] = p
	}

	var txs []models.Transaction
	if err := h.DB.Find(&txs).Error; err != nil {
		return out, err
	}

	type agg struct {
		buyQty, sellQty, buyCost, fees float64
		currency                       string
		currentPrice                   float64
	}
	bySymbol := map[string]*agg{}

	for _, t := range txs {
		a := bySymbol[t.Symbol]
		if a == nil {
			a = &agg{currency: t.Currency}
			if a.currency == "" {
				a.currency = "USD"
			}
			bySymbol[t.Symbol] = a
		}
		if t.Type == models.Buy {
			a.buyQty += float64(t.Quantity)
			a.buyCost += float64(t.Quantity) * float64(t.Price)
		} else {
			a.sellQty += float64(t.Quantity)
		}
		a.fees += t.Fee
		if sp, ok := priceMap[t.Symbol]; ok {
			a.currentPrice = sp.Price
			if sp.Currency != "" {
				a.currency = sp.Currency
			}
		}
	}

	var usdValue, brlValue, usdCost, brlCost float64
	for symbol, a := range bySymbol {
		net := a.buyQty - a.sellQty
		value := net * a.currentPrice
		avg := 0.0
		if a.buyQty > 0 {
			avg = a.buyCost / a.buyQty
		}
		cost := net*avg + a.fees
		cat := ""
		if sp, ok := priceMap[symbol]; ok {
			cat = sp.Category
		}
		valueBRL := value
		if a.currency != "BRL" {
			usdValue += value
			usdCost += cost
			valueBRL = value * rate
		} else {
			brlValue += value
			brlCost += cost
		}
		out.Holdings = append(out.Holdings, snapshotHolding{
			Symbol:   symbol,
			ValueBRL: valueBRL,
			Category: cat,
			Kind:     "ticker",
		})
	}

	var fixed []models.FixedBalance
	if err := h.DB.Find(&fixed).Error; err != nil {
		return out, err
	}
	for _, fb := range fixed {
		amount := fb.Amount
		cur := fb.Currency
		if cur == "" {
			cur = "BRL"
		}
		valueBRL := amount
		if cur == "BRL" {
			brlValue += amount
			brlCost += amount
		} else {
			usdValue += amount
			usdCost += amount
			valueBRL = amount * rate
		}
		out.Holdings = append(out.Holdings, snapshotHolding{
			Symbol:   fb.Name,
			ValueBRL: valueBRL,
			Category: fb.Category,
			Kind:     "fixed",
		})
	}

	out.TotalValueUSD = usdValue
	out.TotalValueBRL = brlValue + usdValue*rate
	out.TotalPnlBRL = (brlValue - brlCost) + (usdValue-usdCost)*rate
	return out, nil
}

// Create handles POST /snapshots — captures current portfolio totals.
// At most one snapshot per calendar day (server local time). Concurrent
// calls are serialized; if one already exists for today, returns it (200).
func (h *PortfolioSnapshotHandler) Create(w http.ResponseWriter, r *http.Request) {
	snapshotCreateMu.Lock()
	defer snapshotCreateMu.Unlock()

	now := time.Now()
	if existing, err := h.findSnapshotForLocalDay(now); err != nil {
		h.Logger.Error("Failed to check existing snapshots", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	} else if existing != nil {
		h.Logger.Infof("Snapshot already exists for today (%s) — skipping", existing.ID)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Snapshot-Status", "already-today")
		json.NewEncoder(w).Encode(existing)
		return
	}

	totals, err := h.computeTotals()
	if err != nil {
		h.Logger.Error("Failed to compute portfolio totals", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	holdingsJSON, err := json.Marshal(totals.Holdings)
	if err != nil {
		http.Error(w, "Failed to encode holdings", http.StatusInternalServerError)
		return
	}

	snap := models.PortfolioSnapshot{
		TotalValueBRL: totals.TotalValueBRL,
		TotalValueUSD: totals.TotalValueUSD,
		TotalPnlBRL:   totals.TotalPnlBRL,
		DollarRate:    totals.DollarRate,
		HoldingsJSON:  string(holdingsJSON),
		Note:          "auto",
	}
	if err := h.DB.Create(&snap).Error; err != nil {
		h.Logger.Error("Failed to save snapshot", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infof("Portfolio snapshot taken: %.2f BRL at %s", snap.TotalValueBRL, now.Format(time.RFC3339))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Snapshot-Status", "created")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(snap)
}

// List handles GET /snapshots
func (h *PortfolioSnapshotHandler) List(w http.ResponseWriter, r *http.Request) {
	var rows []models.PortfolioSnapshot
	if err := h.DB.Order("created_at asc").Find(&rows).Error; err != nil {
		h.Logger.Error("Failed to list snapshots", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []models.PortfolioSnapshot{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows)
}

// Delete handles DELETE /snapshots/{id}
func (h *PortfolioSnapshotHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result := h.DB.Where("id = ?", id).Delete(&models.PortfolioSnapshot{})
	if result.Error != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		http.Error(w, "Snapshot not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeduplicateSnapshotsPerDay soft-deletes extra snapshots that share the same
// local calendar day, keeping the earliest. Idempotent — safe on every startup.
func DeduplicateSnapshotsPerDay(db *gorm.DB, logger *zap.SugaredLogger) {
	var rows []models.PortfolioSnapshot
	if err := db.Order("created_at asc").Find(&rows).Error; err != nil {
		logger.Warnf("snapshot dedupe load failed: %v", err)
		return
	}
	seen := map[string]string{} // day -> kept id
	removed := 0
	for _, s := range rows {
		day := s.CreatedAt.In(time.Local).Format("2006-01-02")
		if kept, ok := seen[day]; ok {
			if err := db.Where("id = ?", s.ID).Delete(&models.PortfolioSnapshot{}).Error; err != nil {
				logger.Warnf("snapshot dedupe delete %s: %v", s.ID, err)
				continue
			}
			removed++
			logger.Infof("Removed duplicate snapshot %s (day %s, kept %s)", s.ID, day, kept)
		} else {
			seen[day] = s.ID
		}
	}
	if removed > 0 {
		logger.Infof("Snapshot dedupe removed %d duplicate(s)", removed)
	}
}
