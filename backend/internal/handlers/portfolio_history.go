package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/services"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// fxSymbol is the Yahoo FX pair we store in history_tickers to value USD-quoted
// positions at each month's historical rate (see PORTFOLIO_RECONSTRUCTION.md §3).
const fxSymbol = "USDBRL=X"

type PortfolioHistoryHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

func NewPortfolioHistoryHandler(db *gorm.DB, logger *zap.SugaredLogger, finance *services.FinanceService) *PortfolioHistoryHandler {
	return &PortfolioHistoryHandler{DB: db, Logger: logger, Finance: finance}
}

// monthSeries holds one symbol's monthly closes, sorted ascending, for lookups
// with forward-fill (carry the last known close into gap months).
type monthSeries struct {
	byPeriod map[string]float64
	periods  []string // sorted ascending
	currency string
}

// at returns the close to use for a period. If the exact period is missing it
// forward-fills from the latest earlier period. If the period predates the whole
// series it returns the earliest close and flags the result as approximate.
func (s monthSeries) at(period string) (close float64, ok bool, approx bool) {
	if v, found := s.byPeriod[period]; found {
		return v, true, false
	}
	best := ""
	for _, p := range s.periods {
		if p <= period {
			best = p
		} else {
			break
		}
	}
	if best != "" {
		return s.byPeriod[best], true, false
	}
	if len(s.periods) > 0 {
		return s.byPeriod[s.periods[0]], true, true // target is before the first close we have
	}
	return 0, false, false
}

type reconstructedPoint struct {
	Period        string    `json:"period"` // YYYY-MM
	Date          time.Time `json:"date"`
	TotalValueBRL float64   `json:"total_value_brl"`
	TotalPnlBRL   float64   `json:"total_pnl_brl"`
	Partial       bool      `json:"partial"` // some held symbol lacked a real close for this month
}

// GetHistory handles GET /portfolio/history — the reconstructed monthly portfolio
// value + P&L from the first transaction's month to now. Computed live from
// transactions × history_tickers × the USDBRL=X series; nothing is stored, and
// fixed balances are excluded (they have no historical timeline).
func (h *PortfolioHistoryHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	var txs []models.Transaction
	if err := h.DB.Order("date asc").Find(&txs).Error; err != nil {
		h.Logger.Error("reconstruction: load transactions", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if len(txs) == 0 {
		writeJSON(w, []reconstructedPoint{})
		return
	}

	// Optional asset-class filter (?classes=USA,CRYPTO). Empty means all. Mirrors
	// the dashboard's BRA/USA/CRYPTO buckets so the chart matches the squares.
	classFilter := map[string]bool{}
	if raw := strings.TrimSpace(r.URL.Query().Get("classes")); raw != "" {
		for _, c := range strings.Split(raw, ",") {
			c = strings.ToUpper(strings.TrimSpace(c))
			if c != "" {
				classFilter[c] = true
			}
		}
	}

	// Price series per symbol (native currency), built from history_tickers.
	var rows []models.TickerHistory
	if err := h.DB.Order("period asc").Find(&rows).Error; err != nil {
		h.Logger.Error("reconstruction: load history", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	series := map[string]*monthSeries{}
	for _, row := range rows {
		s := series[row.Symbol]
		if s == nil {
			s = &monthSeries{byPeriod: map[string]float64{}}
			series[row.Symbol] = s
		}
		if _, dup := s.byPeriod[row.Period]; !dup {
			s.periods = append(s.periods, row.Period)
		}
		s.byPeriod[row.Period] = row.Close
		if row.Currency != "" {
			s.currency = row.Currency
		}
	}
	for _, s := range series {
		sort.Strings(s.periods)
	}

	// FX series (USD -> BRL). Fall back to the current cached rate when we have no
	// historical FX at all, so the curve still renders (approximately).
	fx := series[fxSymbol]
	fallbackRate := 5.5
	var cur models.Currency
	if err := h.DB.First(&cur, "code = ?", "USD").Error; err == nil && cur.Rate > 0 {
		fallbackRate = cur.Rate
	}
	rateAt := func(period string) float64 {
		if fx != nil {
			if v, ok, _ := fx.at(period); ok {
				return v
			}
		}
		return fallbackRate
	}

	// Native-currency resolver: prefer the history row's own currency, else the
	// cached ticker currency, else infer USD for crypto pairs / default USD.
	var tickers []models.Ticker
	h.DB.Find(&tickers)
	tickerCurrency := map[string]string{}
	for _, t := range tickers {
		tickerCurrency[t.Symbol] = t.Currency
	}

	// Incremental per-symbol aggregation as we walk months forward.
	type agg struct {
		buyQty, sellQty, buyCostBRL, feesBRL float64
	}
	bySymbol := map[string]*agg{}
	txIdx := 0

	firstPeriod := txs[0].Date.UTC().Format("2006-01")
	current := time.Now().UTC()
	cursor := monthStart(firstPeriod)
	end := time.Date(current.Year(), current.Month(), 1, 0, 0, 0, 0, time.UTC)

	points := []reconstructedPoint{}
	for !cursor.After(end) {
		period := cursor.Format("2006-01")

		// Fold in every transaction up to and including this month, converting each
		// buy's cost to BRL at ITS OWN month's FX (what you actually paid).
		for txIdx < len(txs) && txs[txIdx].Date.UTC().Format("2006-01") <= period {
			t := txs[txIdx]
			txIdx++
			if models.IsLegacyFixedSymbol(t.Symbol) {
				continue
			}
			a := bySymbol[t.Symbol]
			if a == nil {
				a = &agg{}
				bySymbol[t.Symbol] = a
			}
			txCur := t.Currency
			if txCur == "" {
				txCur = "USD"
			}
			txRate := 1.0
			if txCur != "BRL" {
				txRate = rateAt(t.Date.UTC().Format("2006-01"))
			}
			if t.Type == models.Buy {
				a.buyQty += float64(t.Quantity)
				a.buyCostBRL += float64(t.Quantity) * t.Price * txRate
			} else {
				a.sellQty += float64(t.Quantity)
			}
			a.feesBRL += t.Fee * txRate
		}

		var valueBRL, costBRL float64
		partial := false
		for symbol, a := range bySymbol {
			s := series[symbol]
			if len(classFilter) > 0 {
				native := ""
				if s != nil {
					native = s.currency
				}
				if native == "" {
					native = tickerCurrency[symbol]
				}
				if !classFilter[classForSymbol(symbol, native)] {
					continue
				}
			}
			net := a.buyQty - a.sellQty
			if net <= 0 {
				continue
			}
			if s == nil {
				partial = true // held this month but we have no price history at all
				continue
			}
			close, ok, approx := s.at(period)
			if !ok {
				partial = true
				continue
			}
			if approx {
				partial = true
			}

			native := s.currency
			if native == "" {
				native = tickerCurrency[symbol]
			}
			closeBRL := close
			if native == "" || native == "USD" {
				closeBRL = close * rateAt(period) // crypto pairs (BTC-USD) are USD-quoted
			}
			// BRL-native stays as-is; any other native currency is treated as already-BRL
			// to avoid a nonsensical zero (matches convertPrice's conservative default).

			valueBRL += net * closeBRL
			avg := 0.0
			if a.buyQty > 0 {
				avg = a.buyCostBRL / a.buyQty
			}
			costBRL += net*avg + a.feesBRL
		}

		points = append(points, reconstructedPoint{
			Period:        period,
			Date:          cursor,
			TotalValueBRL: valueBRL,
			TotalPnlBRL:   valueBRL - costBRL,
			Partial:       partial,
		})
		cursor = cursor.AddDate(0, 1, 0)
	}

	writeJSON(w, points)
}

// Backfill handles POST /portfolio/history/backfill — ensures history_tickers has
// the full monthly series for every traded symbol plus the USDBRL=X FX pair, so
// GetHistory has the inputs it needs. Idempotent (upserts on symbol+period).
func (h *PortfolioHistoryHandler) Backfill(w http.ResponseWriter, r *http.Request) {
	var symbols []string
	if err := h.DB.Model(&models.Transaction{}).Distinct().Pluck("symbol", &symbols).Error; err != nil {
		h.Logger.Error("backfill: list symbols", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	tickerCurrency := map[string]string{}
	var tickers []models.Ticker
	h.DB.Find(&tickers)
	for _, t := range tickers {
		tickerCurrency[t.Symbol] = t.Currency
	}

	synced, failed := 0, 0
	for _, symbol := range symbols {
		if symbol == "" || models.IsLegacyFixedSymbol(symbol) {
			continue
		}
		cur := tickerCurrency[symbol]
		if cur == "" {
			cur = "USD"
		}
		if h.syncSeries(symbol, cur) {
			synced++
		} else {
			failed++
		}
	}

	// The FX pair itself: currency arg is irrelevant (buildYahooSymbol leaves
	// USDBRL=X untouched), so pass USD.
	fxSynced := h.syncSeries(fxSymbol, "USD")

	writeJSON(w, map[string]interface{}{
		"symbols_synced": synced,
		"symbols_failed": failed,
		"fx_synced":      fxSynced,
	})
}

// syncSeries fetches a symbol's full monthly series and upserts every row. Returns
// false on fetch failure (logged, non-fatal for the batch).
func (h *PortfolioHistoryHandler) syncSeries(symbol, currency string) bool {
	history, err := h.Finance.FetchMonthlyHistory(symbol, currency)
	if err != nil {
		h.Logger.Warnf("backfill: fetch %s failed: %v", symbol, err)
		return false
	}
	for _, row := range history {
		row.Symbol = symbol
		if err := h.DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "symbol"}, {Name: "period"}},
			DoUpdates: clause.AssignmentColumns([]string{"date", "close", "currency"}),
		}).Create(&row).Error; err != nil {
			h.Logger.Warnf("backfill: upsert %s %s: %v", symbol, row.Period, err)
		}
	}
	h.Logger.Infof("backfill: %s synced %d period(s)", symbol, len(history))
	return true
}

// classForSymbol buckets a traded symbol the same way the frontend does:
// crypto pairs (BTC/USD) -> CRYPTO, USD-quoted -> USA, everything else -> BRA.
// (Fixed balances are FIXA, but they never reach the reconstruction.)
func classForSymbol(symbol, nativeCurrency string) string {
	if strings.Contains(symbol, "/") {
		return "CRYPTO"
	}
	if strings.EqualFold(nativeCurrency, "USD") {
		return "USA"
	}
	return "BRA"
}

// monthStart parses a YYYY-MM period into the first instant of that month (UTC).
func monthStart(period string) time.Time {
	t, err := time.Parse("2006-01", period)
	if err != nil {
		return time.Now().UTC()
	}
	return t
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
