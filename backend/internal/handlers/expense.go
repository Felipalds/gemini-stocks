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

	// Optional drill-down filters: category (as shown in analytics, where empty
	// categories read as "Other"), a single calendar month (YYYY-MM), and/or an
	// explicit date range (from/to as YYYY-MM-DD). Range takes precedence when both
	// a month and a range are supplied.
	category := r.URL.Query().Get("category")
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	var rangeStart, rangeEnd time.Time
	if m := r.URL.Query().Get("month"); m != "" {
		parsed, err := time.ParseInLocation("2006-01", m, time.Local)
		if err != nil {
			http.Error(w, "Invalid `month` (expected YYYY-MM)", http.StatusBadRequest)
			return
		}
		rangeStart = time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.Local)
		rangeEnd = rangeStart.AddDate(0, 1, 0).Add(-time.Nanosecond)
	}
	if f := r.URL.Query().Get("from"); f != "" {
		parsed, err := parseDateParam(f)
		if err != nil {
			http.Error(w, "Invalid `from` (expected YYYY-MM-DD)", http.StatusBadRequest)
			return
		}
		rangeStart = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.Local)
	}
	if t := r.URL.Query().Get("to"); t != "" {
		parsed, err := parseDateParam(t)
		if err != nil {
			http.Error(w, "Invalid `to` (expected YYYY-MM-DD)", http.StatusBadRequest)
			return
		}
		rangeEnd = endOfDay(parsed)
	}

	filtered := func() *gorm.DB {
		q := h.DB.Model(&models.Expense{})
		if category == "Other" {
			q = q.Where("category = '' OR category = 'Other'")
		} else if category != "" {
			q = q.Where("category = ?", category)
		}
		if !rangeStart.IsZero() {
			q = q.Where("date >= ?", rangeStart)
		}
		if !rangeEnd.IsZero() {
			q = q.Where("date <= ?", rangeEnd)
		}
		if search != "" {
			like := "%" + search + "%"
			q = q.Where("name LIKE ? OR category LIKE ?", like, like)
		}
		return q
	}

	var total int64
	if err := filtered().Count(&total).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	var rows []models.Expense
	// Newest expenses first (statement date, then insert time as tiebreaker).
	if err := filtered().
		Order("expenses.date DESC, expenses.created_at DESC").
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
// Optional body field bulk_same_name: when true, also updates every other
// expense that currently shares this row's *old* name (name + category only).
func (h *ExpenseHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.Expense
	if err := h.DB.First(&existing, "id = ?", id).Error; err != nil {
		http.Error(w, "Expense not found", http.StatusNotFound)
		return
	}

	var body struct {
		models.Expense
		BulkSameName bool `json:"bulk_same_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	oldName := existing.Name
	newName := body.Name
	newCategory := body.Category

	existing.Name = body.Name
	existing.Category = body.Category
	existing.Value = body.Value
	existing.Currency = body.Currency
	existing.Date = body.Date
	existing.Note = body.Note
	existing.Recurring = body.Recurring
	existing.Bank = body.Bank
	existing.PaymentType = body.PaymentType
	if existing.Currency == "" {
		existing.Currency = "BRL"
	}

	updatedCount := int64(1)
	if body.BulkSameName && oldName != "" {
		updates := map[string]any{
			"name":     newName,
			"category": newCategory,
		}
		result := h.DB.Model(&models.Expense{}).
			Where("name = ? AND id <> ?", oldName, existing.ID).
			Updates(updates)
		if result.Error != nil {
			h.Logger.Error("Failed bulk expense update", zap.Error(result.Error))
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		updatedCount += result.RowsAffected
	}

	if err := h.DB.Save(&existing).Error; err != nil {
		h.Logger.Error("Failed to update expense", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Keep alias map in sync when renaming (does not rewrite other fields).
	if newName != "" && newName != oldName {
		upsertMerchantAlias(h.DB, oldName, newName, newCategory)
	} else if newCategory != "" {
		updateAliasCategoryOnly(h.DB, oldName, newCategory)
	}
	ensureCategoryExists(h.DB, newCategory)

	rates := h.rateMap()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"expense":       expenseResponse{Expense: existing, ValueBRL: toBRL(existing.Value, existing.Currency, rates)},
		"updated_count": updatedCount,
	})
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
	loc := now.Location()

	// The overview cards, charts and breakdowns are scoped to a selectable
	// period given as ?from=YYYY-MM-DD&to=YYYY-MM-DD. Empty `from` means all time
	// (no lower bound); empty `to` means up to now. All-time totals ("total
	// spent", "largest ever") ignore the period.
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
	periodEnd := now
	if !to.IsZero() {
		periodEnd = endOfDay(to)
	}
	bounded := !from.IsZero()
	var periodStart time.Time
	if bounded {
		periodStart = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, loc)
	}

	// Previous equal-length window, for the period-over-period delta. Only
	// meaningful for a bounded range.
	var prevStart, prevEnd time.Time
	if bounded {
		length := periodEnd.Sub(periodStart)
		prevEnd = periodStart.Add(-time.Nanosecond)
		prevStart = periodStart.Add(-length)
	}

	// Expand recurrences to whichever is later, now or periodEnd, so all-time
	// totals stay correct even when the period ends in the past.
	expandTo := periodEnd
	if now.After(expandTo) {
		expandTo = now
	}

	inPeriod := func(d time.Time) bool {
		if bounded && d.Before(periodStart) {
			return false
		}
		return !d.After(periodEnd)
	}

	categoryPeriod := map[string]float64{}
	nameTotals := map[string]float64{}
	dayTotals := map[string]float64{}
	monthTotals := map[string]float64{}
	periodTotal := 0.0
	prevTotal := 0.0
	allTimeTotal := 0.0
	var minDate time.Time

	type singleInstance struct {
		Name     string    `json:"name"`
		Category string    `json:"category"`
		Date     time.Time `json:"date"`
		ValueBRL float64   `json:"value_brl"`
	}
	var largestAll singleInstance
	var largestPeriod singleInstance
	periodInstances := []singleInstance{}

	for _, e := range expenses {
		brl := toBRL(e.Value, e.Currency, rates)
		for _, d := range expandRecurringDates(e.Date, e.Recurring, time.Time{}, expandTo) {
			allTimeTotal += brl
			if minDate.IsZero() || d.Before(minDate) {
				minDate = d
			}
			if brl > largestAll.ValueBRL {
				largestAll = singleInstance{Name: e.Name, Category: e.Category, Date: d, ValueBRL: brl}
			}
			if inPeriod(d) {
				cat := fallback(e.Category, "Other")
				periodTotal += brl
				categoryPeriod[cat] += brl
				nameTotals[e.Name] += brl
				dayTotals[bucketKey(d, "day")] += brl
				monthTotals[bucketKey(d, "month")] += brl
				periodInstances = append(periodInstances, singleInstance{
					Name:     e.Name,
					Category: e.Category,
					Date:     d,
					ValueBRL: brl,
				})
				if brl > largestPeriod.ValueBRL {
					largestPeriod = singleInstance{Name: e.Name, Category: e.Category, Date: d, ValueBRL: brl}
				}
			}
			if bounded && !d.Before(prevStart) && !d.After(prevEnd) {
				prevTotal += brl
			}
		}
	}

	// Period-over-period delta (vs the preceding equal-length window).
	var deltaPercent *float64
	if bounded && prevTotal > 0 {
		v := (periodTotal - prevTotal) / prevTotal * 100
		deltaPercent = &v
	}

	// Top-5 instances within the period.
	sort.Slice(periodInstances, func(i, j int) bool {
		return periodInstances[i].ValueBRL > periodInstances[j].ValueBRL
	})
	if len(periodInstances) > 5 {
		periodInstances = periodInstances[:5]
	}

	// Window length for averages and budget scaling. For an unbounded (all-time)
	// range, start at the earliest expense so the averages stay meaningful.
	effStart := periodStart
	if !bounded {
		effStart = minDate
	}
	if effStart.IsZero() || effStart.After(periodEnd) {
		effStart = periodEnd
	}
	days := periodEnd.Sub(effStart).Hours()/24 + 1
	if days < 1 {
		days = 1
	}
	periodMonths := (periodEnd.Year()-effStart.Year())*12 + int(periodEnd.Month()-effStart.Month()) + 1
	if periodMonths < 1 {
		periodMonths = 1
	}
	avgDaily := periodTotal / days
	avgMonthly := periodTotal / float64(periodMonths)

	// Budget status scaled to the period (monthly budget × months in range).
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
		spent := periodTotal
		if b.Category != "" {
			spent = categoryPeriod[b.Category]
		}
		scaled := b.AmountBRL * float64(periodMonths)
		pct := 0.0
		if scaled > 0 {
			pct = spent / scaled * 100
		}
		budgetOut = append(budgetOut, budgetStatus{
			Category:        b.Category,
			BudgetBRL:       scaled,
			SpentBRL:        spent,
			PercentConsumed: pct,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"top_category":             topBucket(categoryPeriod),
		"top_name":                 topBucket(nameTotals),
		"top_day":                  topBucket(dayTotals),
		"top_month":                topBucket(monthTotals),
		"category_breakdown":       sortedBuckets(categoryPeriod, true),
		"monthly_series":           sortedBuckets(monthTotals, false),
		"average_daily":            avgDaily,
		"average_monthly":          avgMonthly,
		"largest_single":           largestAll,
		"largest_in_period":        largestPeriod,
		"period_delta_percent":     deltaPercent,
		"period_months":            periodMonths,
		"top_5":                    periodInstances,
		"budget_status":            budgetOut,
		"period_total_brl":         periodTotal,
		"total_spent_all_time_brl": allTimeTotal,
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
