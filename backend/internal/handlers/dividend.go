package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/services"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type DividendHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

func NewDividendHandler(db *gorm.DB, logger *zap.SugaredLogger, finance *services.FinanceService) *DividendHandler {
	return &DividendHandler{DB: db, Logger: logger, Finance: finance}
}

type dividendResponse struct {
	models.Dividend
	ValueBRL float64 `json:"value_brl"`
}

// rateMap returns currency code → BRL conversion factor (BRL = 1.0). Mirrors the
// expense handler's rate map so dividend totals convert the same way.
func (h *DividendHandler) rateMap() map[string]float64 {
	out := map[string]float64{"BRL": 1.0}
	var rows []models.Currency
	if err := h.DB.Find(&rows).Error; err != nil {
		h.Logger.Warn("Failed to load currency rates", zap.Error(err))
		return out
	}
	for _, c := range rows {
		out[c.Code] = c.Rate
	}
	return out
}

// dividendBRL converts a dividend to BRL using its own manually-entered DollarRate
// when present, so historical totals don't drift as the live rate changes. BRL
// rows pass through; a missing rate falls back to the current cached rate map.
func dividendBRL(d models.Dividend, fallback map[string]float64) float64 {
	net := d.Amount - d.Tax // tax is in the same currency as the amount
	if d.Currency == "" || d.Currency == "BRL" {
		return net
	}
	if d.DollarRate > 0 {
		return net * d.DollarRate
	}
	return toBRL(net, d.Currency, fallback)
}

func normalizeKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case models.DividendKindJCP:
		return models.DividendKindJCP
	case models.DividendKindProfit:
		return models.DividendKindProfit
	default:
		return models.DividendKindDividend
	}
}

// Create handles POST /dividends
func (h *DividendHandler) Create(w http.ResponseWriter, r *http.Request) {
	var d models.Dividend
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	d.Symbol = strings.TrimSpace(strings.ToUpper(d.Symbol))
	if d.Symbol == "" || d.Amount <= 0 {
		http.Error(w, "Symbol and positive amount are required", http.StatusBadRequest)
		return
	}
	d.Currency = normalizeCurrency(d.Currency)
	d.Kind = normalizeKind(d.Kind)
	if d.Tax < 0 {
		d.Tax = 0
	}
	if d.Currency == "BRL" {
		d.DollarRate = 0 // irrelevant for BRL rows
	}
	if d.Date.IsZero() {
		d.Date = time.Now()
	}

	if err := h.DB.Create(&d).Error; err != nil {
		h.Logger.Error("Failed to create dividend", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	rates := h.rateMap()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(dividendResponse{Dividend: d, ValueBRL: dividendBRL(d, rates)})
}

// List handles GET /dividends — newest first, each enriched with value_brl.
func (h *DividendHandler) List(w http.ResponseWriter, r *http.Request) {
	var rows []models.Dividend
	if err := h.DB.Order("dividends.date DESC, dividends.created_at DESC").Find(&rows).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	rates := h.rateMap()
	items := make([]dividendResponse, 0, len(rows))
	for _, d := range rows {
		items = append(items, dividendResponse{Dividend: d, ValueBRL: dividendBRL(d, rates)})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// Update handles PUT /dividends/{id}
func (h *DividendHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.Dividend
	if err := h.DB.First(&existing, "id = ?", id).Error; err != nil {
		http.Error(w, "Dividend not found", http.StatusNotFound)
		return
	}

	var body models.Dividend
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	existing.Symbol = strings.TrimSpace(strings.ToUpper(body.Symbol))
	existing.Kind = normalizeKind(body.Kind)
	existing.Amount = body.Amount
	existing.Tax = body.Tax
	existing.Currency = normalizeCurrency(body.Currency)
	existing.DollarRate = body.DollarRate
	existing.Date = body.Date
	existing.Note = body.Note
	if existing.Tax < 0 {
		existing.Tax = 0
	}
	if existing.Currency == "BRL" {
		existing.DollarRate = 0 // irrelevant for BRL rows
	}
	if existing.Date.IsZero() {
		existing.Date = time.Now()
	}

	if err := h.DB.Save(&existing).Error; err != nil {
		h.Logger.Error("Failed to update dividend", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	rates := h.rateMap()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dividendResponse{Dividend: existing, ValueBRL: dividendBRL(existing, rates)})
}

// Delete handles DELETE /dividends/{id}
func (h *DividendHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result := h.DB.Where("id = ?", id).Delete(&models.Dividend{})
	if result.Error != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		http.Error(w, "Dividend not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type tickerDividendBucket struct {
	Symbol   string  `json:"symbol"`
	Count    int     `json:"count"`
	TotalBRL float64 `json:"total_brl"`
}

type dividendSummary struct {
	TotalBRL float64                `json:"total_brl"`
	Count    int                    `json:"count"`
	ByTicker []tickerDividendBucket `json:"by_ticker"`
	ByYear   []bucket               `json:"by_year"`
	ByMonth  []bucket               `json:"by_month"`
}

// Summary handles GET /dividends/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Aggregates dividend income per ticker and by year / month, all in BRL.
func (h *DividendHandler) Summary(w http.ResponseWriter, r *http.Request) {
	from, err := parseDateParam(r.URL.Query().Get("from"))
	if err != nil {
		http.Error(w, "Invalid `from` (expected YYYY-MM-DD)", http.StatusBadRequest)
		return
	}
	to, err := parseDateParam(r.URL.Query().Get("to"))
	if err != nil {
		http.Error(w, "Invalid `to` (expected YYYY-MM-DD)", http.StatusBadRequest)
		return
	}
	if !to.IsZero() {
		to = endOfDay(to)
	}

	var rows []models.Dividend
	if err := h.DB.Find(&rows).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	rates := h.rateMap()

	type tickerAgg struct {
		count int
		total float64
	}
	tickerTotals := map[string]*tickerAgg{}
	yearTotals := map[string]float64{}
	monthTotals := map[string]float64{}
	grandTotal := 0.0
	count := 0

	for _, d := range rows {
		// Apply the optional [from, to] window on the dividend date.
		if !from.IsZero() && d.Date.Before(from) {
			continue
		}
		if !to.IsZero() && d.Date.After(to) {
			continue
		}

		brl := dividendBRL(d, rates)
		grandTotal += brl
		count++

		agg := tickerTotals[d.Symbol]
		if agg == nil {
			agg = &tickerAgg{}
			tickerTotals[d.Symbol] = agg
		}
		agg.count++
		agg.total += brl

		yearTotals[bucketKey(d.Date, "year")] += brl
		monthTotals[bucketKey(d.Date, "month")] += brl
	}

	byTicker := make([]tickerDividendBucket, 0, len(tickerTotals))
	for symbol, agg := range tickerTotals {
		byTicker = append(byTicker, tickerDividendBucket{
			Symbol:   symbol,
			Count:    agg.count,
			TotalBRL: agg.total,
		})
	}
	sort.Slice(byTicker, func(i, j int) bool { return byTicker[i].TotalBRL > byTicker[j].TotalBRL })

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dividendSummary{
		TotalBRL: grandTotal,
		Count:    count,
		ByTicker: byTicker,
		ByYear:   sortedBuckets(yearTotals, false),  // chronological
		ByMonth:  sortedBuckets(monthTotals, false), // chronological
	})
}

// --- Dividend sync from Yahoo -------------------------------------------------

// dividendCandidate is a computed, not-yet-saved dividend the sync proposes. The
// user reviews and confirms these before anything is written.
type dividendCandidate struct {
	Symbol     string    `json:"symbol"`
	Kind       string    `json:"kind"`
	Date       time.Time `json:"date"`
	PerShare   float64   `json:"per_share"`
	Shares     float64   `json:"shares"`
	Amount     float64   `json:"amount"`
	Currency   string    `json:"currency"`
	DollarRate float64   `json:"dollar_rate"`
	ValueBRL   float64   `json:"value_brl"`
	// Status is "new" or "probably_added" (a similar entry already exists).
	Status string `json:"status"`
	Note   string `json:"note"`
}

// usdBrlRateMap builds a month ("YYYY-MM") -> USD→BRL close map plus the sorted
// list of periods, from the stored USDBRL=X history, for resolving a dividend's
// historical dollar rate.
func (h *DividendHandler) usdBrlRateMap() (map[string]float64, []string) {
	var rows []models.TickerHistory
	h.DB.Where("symbol = ?", "USDBRL=X").Order("period asc").Find(&rows)
	m := map[string]float64{}
	periods := make([]string, 0, len(rows))
	for _, r := range rows {
		if _, ok := m[r.Period]; !ok {
			periods = append(periods, r.Period)
		}
		m[r.Period] = r.Close
	}
	return m, periods
}

// rateForPeriod resolves the USD→BRL rate for a month, forward-filling from the
// latest earlier month and falling back to the current rate when history is absent.
func rateForPeriod(period string, m map[string]float64, periods []string, fallback float64) float64 {
	if v, ok := m[period]; ok {
		return v
	}
	best := ""
	for _, p := range periods {
		if p <= period {
			best = p
		} else {
			break
		}
	}
	if best != "" {
		return m[best]
	}
	if len(periods) > 0 {
		return m[periods[0]]
	}
	return fallback
}

// sharesHeldBefore returns net shares held strictly before the ex-date day — the
// entitlement rule (buying on/after the ex-date does not earn the dividend).
func sharesHeldBefore(txs []models.Transaction, exDate time.Time) float64 {
	ex := exDate.UTC()
	exDay := time.Date(ex.Year(), ex.Month(), ex.Day(), 0, 0, 0, 0, time.UTC)
	net := 0.0
	for _, t := range txs {
		td := t.Date.UTC()
		tDay := time.Date(td.Year(), td.Month(), td.Day(), 0, 0, 0, 0, time.UTC)
		if !tDay.Before(exDay) {
			continue
		}
		if t.Type == models.Sell {
			net -= float64(t.Quantity)
		} else {
			net += float64(t.Quantity)
		}
	}
	return net
}

// dividendLikelyExists flags a candidate as "probably added" when a stored row
// for the same symbol falls in the same calendar month as the ex-date, or close
// enough to bridge the ex-date → pay-date gap (Yahoo gives the ex-date; users
// record the pay-date, 1–4 weeks later, which can also spill into the next month).
//
// Amount is intentionally NOT compared: the recorded value routinely differs from
// the computed one (withheld tax, shares held outside the transaction history,
// rounding). 45 days stays under the ~90-day quarterly gap, so adjacent quarters
// are not confused (monthly payers are the known exception).
func dividendLikelyExists(existing []models.Dividend, symbol string, date time.Time) bool {
	const window = 45 * 24 * time.Hour
	exMonth := date.UTC().Format("2006-01")
	for _, d := range existing {
		if !strings.EqualFold(d.Symbol, symbol) {
			continue
		}
		if d.Date.UTC().Format("2006-01") == exMonth {
			return true
		}
		diff := d.Date.Sub(date)
		if diff < 0 {
			diff = -diff
		}
		if diff <= window {
			return true
		}
	}
	return false
}

// SyncPreview handles GET /dividends/sync/preview?scope=all|last-month. It computes
// the dividends you likely received (per-share from Yahoo × shares held at each
// ex-date) WITHOUT writing anything, flagging rows that look already-recorded.
func (h *DividendHandler) SyncPreview(w http.ResponseWriter, r *http.Request) {
	var from, to time.Time
	if r.URL.Query().Get("scope") == "last-month" {
		now := time.Now().UTC()
		firstThis := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		from = firstThis.AddDate(0, -1, 0)
		to = firstThis.Add(-time.Nanosecond)
	}

	var txs []models.Transaction
	h.DB.Order("date asc").Find(&txs)
	bySymbol := map[string][]models.Transaction{}
	for _, t := range txs {
		if models.IsLegacyFixedSymbol(t.Symbol) {
			continue
		}
		bySymbol[t.Symbol] = append(bySymbol[t.Symbol], t)
	}

	var tickers []models.Ticker
	h.DB.Find(&tickers)
	currencyOf := map[string]string{}
	for _, t := range tickers {
		currencyOf[t.Symbol] = t.Currency
	}

	var existing []models.Dividend
	h.DB.Find(&existing)

	fallback := 5.5
	var cur models.Currency
	if err := h.DB.First(&cur, "code = ?", "USD").Error; err == nil && cur.Rate > 0 {
		fallback = cur.Rate
	}
	rateMonth, periods := h.usdBrlRateMap()

	candidates := []dividendCandidate{}
	for symbol, list := range bySymbol {
		currency := currencyOf[symbol]
		if currency == "" {
			currency = list[0].Currency
		}
		currency = normalizeCurrency(currency)

		events, err := h.Finance.FetchDividends(symbol, currency)
		if err != nil {
			h.Logger.Warnf("dividend sync: fetch %s: %v", symbol, err)
			continue
		}
		for _, ev := range events {
			if !from.IsZero() && ev.Date.Before(from) {
				continue
			}
			if !to.IsZero() && ev.Date.After(to) {
				continue
			}
			shares := sharesHeldBefore(list, ev.Date)
			if shares <= 0 {
				continue
			}
			amount := ev.PerShare * shares
			rate := 0.0
			brl := amount
			if currency != "BRL" {
				rate = rateForPeriod(ev.Date.Format("2006-01"), rateMonth, periods, fallback)
				brl = amount * rate
			}
			status := "new"
			if dividendLikelyExists(existing, symbol, ev.Date) {
				status = "probably_added"
			}
			candidates = append(candidates, dividendCandidate{
				Symbol:     symbol,
				Kind:       models.DividendKindDividend,
				Date:       ev.Date,
				PerShare:   ev.PerShare,
				Shares:     shares,
				Amount:     amount,
				Currency:   currency,
				DollarRate: rate,
				ValueBRL:   brl,
				Status:     status,
				Note:       "Imported from Yahoo",
			})
		}
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Date.After(candidates[j].Date)
	})

	writeJSON(w, candidates)
}

// SyncConfirm handles POST /dividends/sync — inserts the dividend rows the user
// explicitly confirmed from the preview. Nothing is written except what is sent.
func (h *DividendHandler) SyncConfirm(w http.ResponseWriter, r *http.Request) {
	var rows []models.Dividend
	if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	inserted := 0
	for i := range rows {
		d := rows[i]
		d.ID = "" // force a fresh UUID
		d.Symbol = strings.TrimSpace(strings.ToUpper(d.Symbol))
		if d.Symbol == "" || d.Amount <= 0 {
			continue
		}
		d.Currency = normalizeCurrency(d.Currency)
		d.Kind = normalizeKind(d.Kind)
		if d.Source == "" {
			d.Source = "yahoo"
		}
		if d.Tax < 0 {
			d.Tax = 0
		}
		if d.Currency == "BRL" {
			d.DollarRate = 0
		}
		if d.Date.IsZero() {
			d.Date = time.Now()
		}
		if err := h.DB.Create(&d).Error; err != nil {
			h.Logger.Error("dividend sync: create", zap.Error(err))
			continue
		}
		inserted++
	}

	writeJSON(w, map[string]int{"inserted": inserted})
}
