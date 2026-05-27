package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type ExpenseHandler struct {
	DB     *gorm.DB
	Logger *zap.SugaredLogger
}

func NewExpenseHandler(db *gorm.DB, logger *zap.SugaredLogger) *ExpenseHandler {
	return &ExpenseHandler{DB: db, Logger: logger}
}

type expenseResponse struct {
	models.Expense
	ValueBRL float64 `json:"value_brl"`
}

type paginatedExpenses struct {
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Total    int64             `json:"total"`
	Items    []expenseResponse `json:"items"`
}

// rateMap returns currency code → BRL conversion factor. BRL itself is 1.0;
// missing rates fall back to 0, which collapses converted values to 0
// rather than blowing up — surfaces "you haven't synced rates yet".
func (h *ExpenseHandler) rateMap() map[string]float64 {
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

func toBRL(value float64, currency string, rates map[string]float64) float64 {
	if currency == "" || currency == "BRL" {
		return value
	}
	rate, ok := rates[currency]
	if !ok {
		return 0
	}
	return value * rate
}

// Create handles POST /expenses
func (h *ExpenseHandler) Create(w http.ResponseWriter, r *http.Request) {
	var e models.Expense
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if e.Name == "" || e.Value <= 0 {
		http.Error(w, "Name and positive value are required", http.StatusBadRequest)
		return
	}
	if e.Currency == "" {
		e.Currency = "BRL"
	}
	if e.Date.IsZero() {
		e.Date = time.Now()
	}
	if e.Category == "" {
		e.Category = "Other"
	}
	switch e.Recurring {
	case models.RecurringNone, models.RecurringMonthly, models.RecurringAnnually:
	default:
		http.Error(w, "Recurring must be empty, 'monthly', or 'annually'", http.StatusBadRequest)
		return
	}

	if err := h.DB.Create(&e).Error; err != nil {
		h.Logger.Error("Failed to create expense", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	rates := h.rateMap()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(expenseResponse{Expense: e, ValueBRL: toBRL(e.Value, e.Currency, rates)})
}

// List handles GET /expenses?page=1&page_size=25
func (h *ExpenseHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 200 {
		pageSize = 25
	}

	var total int64
	if err := h.DB.Model(&models.Expense{}).Count(&total).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	var rows []models.Expense
	if err := h.DB.
		Order("date desc, created_at desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	rates := h.rateMap()
	items := make([]expenseResponse, 0, len(rows))
	for _, e := range rows {
		items = append(items, expenseResponse{Expense: e, ValueBRL: toBRL(e.Value, e.Currency, rates)})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(paginatedExpenses{
		Page:     page,
		PageSize: pageSize,
		Total:    total,
		Items:    items,
	})
}

// Update handles PUT /expenses/{id}
func (h *ExpenseHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.Expense
	if err := h.DB.First(&existing, "id = ?", id).Error; err != nil {
		http.Error(w, "Expense not found", http.StatusNotFound)
		return
	}
	var body models.Expense
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	existing.Name = body.Name
	existing.Category = body.Category
	existing.Value = body.Value
	existing.Currency = body.Currency
	existing.Date = body.Date
	existing.Note = body.Note
	existing.Recurring = body.Recurring
	if existing.Currency == "" {
		existing.Currency = "BRL"
	}

	if err := h.DB.Save(&existing).Error; err != nil {
		h.Logger.Error("Failed to update expense", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	rates := h.rateMap()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(expenseResponse{Expense: existing, ValueBRL: toBRL(existing.Value, existing.Currency, rates)})
}

// Delete handles DELETE /expenses/{id}
func (h *ExpenseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result := h.DB.Where("id = ?", id).Delete(&models.Expense{})
	if result.Error != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		http.Error(w, "Expense not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// expandRecurringDates materialises the concrete dates at which the given
// expense applies inside the [from, to] window. A non-recurring expense
// contributes its own Date once if inside the window; a monthly/annually
// recurring expense generates one date per period from the original date
// up to `to`.
//
// `to` defaults to time.Now(); `from` zero means no lower bound (the
// expense's own date acts as the natural lower bound).
func expandRecurringDates(date time.Time, recurring string, from, to time.Time) []time.Time {
	if to.IsZero() {
		to = time.Now()
	}
	if date.After(to) {
		return nil
	}

	in := func(t time.Time) bool {
		if !from.IsZero() && t.Before(from) {
			return false
		}
		return !t.After(to)
	}

	switch recurring {
	case models.RecurringNone:
		if in(date) {
			return []time.Time{date}
		}
		return nil
	case models.RecurringMonthly, models.RecurringAnnually:
		var out []time.Time
		cur := date
		for !cur.After(to) {
			if in(cur) {
				out = append(out, cur)
			}
			if recurring == models.RecurringMonthly {
				cur = cur.AddDate(0, 1, 0)
			} else {
				cur = cur.AddDate(1, 0, 0)
			}
		}
		return out
	default:
		return nil
	}
}

func bucketKey(t time.Time, filter string) string {
	switch filter {
	case "day":
		return t.Format("2006-01-02")
	case "month":
		return t.Format("2006-01")
	case "year":
		return t.Format("2006")
	default:
		return t.Format("2006-01-02")
	}
}

type bucket struct {
	Key      string  `json:"key"`
	TotalBRL float64 `json:"total_brl"`
}

type totalsResponse struct {
	Filter  string   `json:"filter"`
	From    string   `json:"from,omitempty"`
	To      string   `json:"to,omitempty"`
	Buckets []bucket `json:"buckets"`
}

func parseDateParam(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	return time.Parse("2006-01-02", s)
}

// Totals handles GET /expenses/totals?filter=day|month|year[&from=YYYY-MM-DD&to=YYYY-MM-DD]
func (h *ExpenseHandler) Totals(w http.ResponseWriter, r *http.Request) {
	filter := strings.ToLower(r.URL.Query().Get("filter"))
	if filter != "day" && filter != "month" && filter != "year" {
		filter = "month"
	}
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
	if to.IsZero() {
		to = time.Now()
	} else {
		// Make `to` inclusive of the whole day
		to = endOfDay(to)
	}

	expenses, rates, err := h.allExpensesWithRates()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	totals := map[string]float64{}
	for _, e := range expenses {
		brl := toBRL(e.Value, e.Currency, rates)
		for _, d := range expandRecurringDates(e.Date, e.Recurring, from, to) {
			totals[bucketKey(d, filter)] += brl
		}
	}

	resp := totalsResponse{
		Filter:  filter,
		Buckets: sortedBuckets(totals, true),
	}
	if !from.IsZero() {
		resp.From = from.Format("2006-01-02")
	}
	resp.To = to.Format("2006-01-02")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Categories handles GET /expenses/categories?from=&to=
// Returns the BRL breakdown by category for the given window (default = all time).
func (h *ExpenseHandler) Categories(w http.ResponseWriter, r *http.Request) {
	from, err := parseDateParam(r.URL.Query().Get("from"))
	if err != nil {
		http.Error(w, "Invalid `from`", http.StatusBadRequest)
		return
	}
	to, err := parseDateParam(r.URL.Query().Get("to"))
	if err != nil {
		http.Error(w, "Invalid `to`", http.StatusBadRequest)
		return
	}
	if to.IsZero() {
		to = time.Now()
	} else {
		to = endOfDay(to)
	}

	expenses, rates, err := h.allExpensesWithRates()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	out := map[string]float64{}
	for _, e := range expenses {
		brl := toBRL(e.Value, e.Currency, rates)
		instances := expandRecurringDates(e.Date, e.Recurring, from, to)
		if len(instances) == 0 {
			continue
		}
		category := e.Category
		if category == "" {
			category = "Other"
		}
		out[category] += brl * float64(len(instances))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"from":      formatOrEmpty(from),
		"to":        to.Format("2006-01-02"),
		"breakdown": sortedBuckets(out, true),
	})
}

// Analytics handles GET /expenses/analytics
func (h *ExpenseHandler) Analytics(w http.ResponseWriter, r *http.Request) {
	expenses, rates, err := h.allExpensesWithRates()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	now := time.Now()
	startOfThisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	startOfLastMonth := startOfThisMonth.AddDate(0, -1, 0)
	endOfLastMonth := startOfThisMonth.Add(-time.Nanosecond)
	last30Start := now.AddDate(0, 0, -30)
	last12mStart := time.Date(now.Year()-1, now.Month(), 1, 0, 0, 0, 0, now.Location())

	categoryTotals := map[string]float64{}
	nameTotals := map[string]float64{}
	dayTotals := map[string]float64{}
	monthTotals := map[string]float64{}
	yearTotals := map[string]float64{}
	category30d := map[string]float64{}
	monthSpendThis := 0.0
	monthSpendLast := 0.0
	last30Total := 0.0
	last12mTotal := 0.0
	categorySpendThisMonth := map[string]float64{}

	type singleInstance struct {
		Name     string    `json:"name"`
		Category string    `json:"category"`
		Date     time.Time `json:"date"`
		ValueBRL float64   `json:"value_brl"`
	}
	var largest singleInstance
	currentMonthInstances := []singleInstance{}

	for _, e := range expenses {
		brl := toBRL(e.Value, e.Currency, rates)
		instances := expandRecurringDates(e.Date, e.Recurring, time.Time{}, now)
		for _, d := range instances {
			categoryTotals[fallback(e.Category, "Other")] += brl
			nameTotals[e.Name] += brl
			dayTotals[bucketKey(d, "day")] += brl
			monthTotals[bucketKey(d, "month")] += brl
			yearTotals[bucketKey(d, "year")] += brl

			if !d.Before(last30Start) {
				category30d[fallback(e.Category, "Other")] += brl
				last30Total += brl
			}
			if !d.Before(last12mStart) {
				last12mTotal += brl
			}
			if !d.Before(startOfThisMonth) {
				monthSpendThis += brl
				categorySpendThisMonth[fallback(e.Category, "Other")] += brl
				currentMonthInstances = append(currentMonthInstances, singleInstance{
					Name:     e.Name,
					Category: e.Category,
					Date:     d,
					ValueBRL: brl,
				})
			} else if !d.Before(startOfLastMonth) && !d.After(endOfLastMonth) {
				monthSpendLast += brl
			}
			if brl > largest.ValueBRL {
				largest = singleInstance{Name: e.Name, Category: e.Category, Date: d, ValueBRL: brl}
			}
		}
	}

	// MoM delta as percent change from last month to this month.
	var momPercent *float64
	if monthSpendLast > 0 {
		v := (monthSpendThis - monthSpendLast) / monthSpendLast * 100
		momPercent = &v
	}

	// Top-5 instances in current month.
	sort.Slice(currentMonthInstances, func(i, j int) bool {
		return currentMonthInstances[i].ValueBRL > currentMonthInstances[j].ValueBRL
	})
	if len(currentMonthInstances) > 5 {
		currentMonthInstances = currentMonthInstances[:5]
	}

	// Budget status (current month).
	var budgets []models.Budget
	_ = h.DB.Find(&budgets).Error
	type budgetStatus struct {
		Category        string  `json:"category"`
		BudgetBRL       float64 `json:"budget_brl"`
		SpentBRL        float64 `json:"spent_brl"`
		PercentConsumed float64 `json:"percent_consumed"`
	}
	budgetOut := []budgetStatus{}
	for _, b := range budgets {
		spent := monthSpendThis
		if b.Category != "" {
			spent = categorySpendThisMonth[b.Category]
		}
		pct := 0.0
		if b.AmountBRL > 0 {
			pct = spent / b.AmountBRL * 100
		}
		budgetOut = append(budgetOut, budgetStatus{
			Category:        b.Category,
			BudgetBRL:       b.AmountBRL,
			SpentBRL:        spent,
			PercentConsumed: pct,
		})
	}

	avgDaily := last30Total / 30.0
	avgMonthly := last12mTotal / 12.0

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"top_category":            topBucket(categoryTotals),
		"top_name":                topBucket(nameTotals),
		"top_day":                 topBucket(dayTotals),
		"top_month":               topBucket(monthTotals),
		"top_year":                topBucket(yearTotals),
		"category_breakdown_30d":  sortedBuckets(category30d, true),
		"average_daily_30d":       avgDaily,
		"average_monthly_12m":     avgMonthly,
		"largest_single":          largest,
		"mom_delta_percent":       momPercent,
		"top_5_current_month":     currentMonthInstances,
		"budget_status":           budgetOut,
		"current_month_total_brl": monthSpendThis,
	})
}

// allExpensesWithRates returns every expense and the currency→BRL rate map.
func (h *ExpenseHandler) allExpensesWithRates() ([]models.Expense, map[string]float64, error) {
	var expenses []models.Expense
	if err := h.DB.Find(&expenses).Error; err != nil {
		return nil, nil, err
	}
	return expenses, h.rateMap(), nil
}

func endOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, int(time.Second-time.Nanosecond), t.Location())
}

func formatOrEmpty(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02")
}

func fallback(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func sortedBuckets(m map[string]float64, descByValue bool) []bucket {
	out := make([]bucket, 0, len(m))
	for k, v := range m {
		out = append(out, bucket{Key: k, TotalBRL: v})
	}
	if descByValue {
		sort.Slice(out, func(i, j int) bool { return out[i].TotalBRL > out[j].TotalBRL })
	} else {
		sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	}
	return out
}

func topBucket(m map[string]float64) *bucket {
	var top *bucket
	for k, v := range m {
		if top == nil || v > top.TotalBRL {
			b := bucket{Key: k, TotalBRL: v}
			top = &b
		}
	}
	return top
}

// ---------------- Budgets ----------------

type BudgetHandler struct {
	DB     *gorm.DB
	Logger *zap.SugaredLogger
}

func NewBudgetHandler(db *gorm.DB, logger *zap.SugaredLogger) *BudgetHandler {
	return &BudgetHandler{DB: db, Logger: logger}
}

func (h *BudgetHandler) List(w http.ResponseWriter, r *http.Request) {
	var rows []models.Budget
	if err := h.DB.Find(&rows).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows)
}

func (h *BudgetHandler) Create(w http.ResponseWriter, r *http.Request) {
	var b models.Budget
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	if b.AmountBRL <= 0 {
		http.Error(w, "amount_brl must be positive", http.StatusBadRequest)
		return
	}
	if err := h.DB.Create(&b).Error; err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(b)
}

func (h *BudgetHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.Budget
	if err := h.DB.First(&existing, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			http.Error(w, "Budget not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	var body models.Budget
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	existing.Category = body.Category
	existing.AmountBRL = body.AmountBRL
	if err := h.DB.Save(&existing).Error; err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

func (h *BudgetHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result := h.DB.Where("id = ?", id).Delete(&models.Budget{})
	if result.Error != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		http.Error(w, "Budget not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

