package statements

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
)

var (
	brlAmountRe = regexp.MustCompile(`(?i)([+\-−–]?\s*)R\$\s*([\d.]*\d,\d{2})`)
	usdAmountRe = regexp.MustCompile(`(?i)USD\s*([\d.,]+)`)
)

var ptMonths = map[string]time.Month{
	"JAN": time.January, "FEV": time.February, "MAR": time.March,
	"ABR": time.April, "MAI": time.May, "JUN": time.June,
	"JUL": time.July, "AGO": time.August, "SET": time.September,
	"OUT": time.October, "NOV": time.November, "DEZ": time.December,
	"janeiro": time.January, "fevereiro": time.February, "março": time.March,
	"marco": time.March, "abril": time.April, "maio": time.May,
	"junho": time.June, "julho": time.July, "agosto": time.August,
	"setembro": time.September, "outubro": time.October,
	"novembro": time.November, "dezembro": time.December,
	"jan": time.January, "fev": time.February, "mar": time.March,
	"abr": time.April, "mai": time.May, "jun": time.June,
	"jul": time.July, "ago": time.August, "set": time.September,
	"out": time.October, "nov": time.November, "dez": time.December,
}

// DetectBank scores statement text and returns the best bank match.
// confidence is 0–1; callers should fall back to manual selection when low.
func DetectBank(text string) (bank string, confidence float64) {
	lower := strings.ToLower(text)
	nubankScore := 0.0
	interScore := 0.0

	if strings.Contains(lower, "nu pagamentos") {
		nubankScore += 0.5
	}
	if strings.Contains(text, "18.236.120/0001-58") {
		nubankScore += 0.3
	}
	if strings.Contains(lower, "transações") || strings.Contains(lower, "transacoes") {
		nubankScore += 0.15
	}
	if strings.Contains(lower, "nubank") {
		nubankScore += 0.2
	}

	if strings.Contains(lower, "banco inter") || strings.Contains(lower, "bancointer") {
		interScore += 0.45
	}
	if strings.Contains(lower, "despesas da fatura") {
		interScore += 0.35
	}
	if strings.Contains(lower, "pontos loop") {
		interScore += 0.2
	}
	if strings.Contains(lower, "inter.co") || strings.Contains(lower, "www.bancointer.com.br") {
		interScore += 0.15
	}

	switch {
	case nubankScore >= interScore && nubankScore >= 0.4:
		return BankNubank, clamp01(nubankScore)
	case interScore > nubankScore && interScore >= 0.4:
		return BankInter, clamp01(interScore)
	default:
		return BankUnknown, 0
	}
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// ParseAmountBR parses Brazilian money like "1.426,74" or "26,65".
func ParseAmountBR(s string) (float64, error) {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, ",", ".")
	return strconv.ParseFloat(s, 64)
}

// ParseAmountUS parses "5.00" / "5,00" style foreign amounts.
func ParseAmountUS(s string) (float64, error) {
	s = strings.TrimSpace(s)
	if strings.Contains(s, ",") && !strings.Contains(s, ".") {
		s = strings.ReplaceAll(s, ",", ".")
	} else {
		s = strings.ReplaceAll(s, ",", "")
	}
	return strconv.ParseFloat(s, 64)
}

func findUSD(line string) (float64, bool) {
	m := usdAmountRe.FindStringSubmatch(line)
	if m == nil {
		return 0, false
	}
	v, err := ParseAmountUS(m[1])
	if err != nil {
		return 0, false
	}
	return v, true
}

func parseShortPTDate(dayMon string, year int) (time.Time, error) {
	parts := strings.Fields(strings.TrimSpace(dayMon))
	if len(parts) != 2 {
		return time.Time{}, fmt.Errorf("bad short date %q", dayMon)
	}
	day, err := strconv.Atoi(parts[0])
	if err != nil {
		return time.Time{}, err
	}
	mon, ok := ptMonths[strings.ToUpper(parts[1])]
	if !ok {
		return time.Time{}, fmt.Errorf("unknown month %q", parts[1])
	}
	return time.Date(year, mon, day, 12, 0, 0, 0, time.UTC), nil
}

var longPTDateRe = regexp.MustCompile(`(?i)^(\d{1,2})\s+de\s+([a-zç.]+)\s+(\d{4})$`)

func parseLongPTDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	m := longPTDateRe.FindStringSubmatch(s)
	if m == nil {
		return time.Time{}, fmt.Errorf("bad long date %q", s)
	}
	day, _ := strconv.Atoi(m[1])
	monKey := strings.TrimSuffix(strings.ToLower(m[2]), ".")
	mon, ok := ptMonths[monKey]
	if !ok {
		return time.Time{}, fmt.Errorf("unknown month %q", m[2])
	}
	year, _ := strconv.Atoi(m[3])
	return time.Date(year, mon, day, 12, 0, 0, 0, time.UTC), nil
}

var (
	slashParcelRe = regexp.MustCompile(`(?i)\-\s*Parcela\s+(\d+)\s*/\s*(\d+)`)
	deParcelRe    = regexp.MustCompile(`(?i)\(Parcela\s+(\d+)\s+de\s+(\d+)\)`)
)

func extractInstallment(name string) (clean string, n, of int) {
	if m := slashParcelRe.FindStringSubmatch(name); m != nil {
		n, _ = strconv.Atoi(m[1])
		of, _ = strconv.Atoi(m[2])
		clean = strings.TrimSpace(slashParcelRe.ReplaceAllString(name, ""))
		return clean, n, of
	}
	if m := deParcelRe.FindStringSubmatch(name); m != nil {
		n, _ = strconv.Atoi(m[1])
		of, _ = strconv.Atoi(m[2])
		clean = strings.TrimSpace(deParcelRe.ReplaceAllString(name, ""))
		return clean, n, of
	}
	return strings.TrimSpace(name), 0, 0
}

func classifyName(name string) (kind, reason string) {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "pagamento"),
		strings.Contains(lower, "pagto"),
		strings.HasPrefix(lower, "pagamentos"):
		return KindPayment, "bill payment"
	case strings.Contains(lower, "iof"):
		return KindIOF, "IOF / FX tax"
	case strings.Contains(lower, "juros"),
		strings.Contains(lower, "encargo"),
		strings.Contains(lower, "multa"),
		strings.Contains(lower, "mora"):
		return KindInterest, "interest / fees"
	case strings.Contains(lower, "cashback"),
		strings.Contains(lower, "recompensa"):
		return KindCashback, "cashback / reward"
	case strings.Contains(lower, "estorno"),
		strings.Contains(lower, "contest"):
		return KindOther, "reversal / dispute"
	default:
		return KindPurchase, ""
	}
}

func selectedForKind(kind string) bool {
	return kind == KindPurchase || kind == KindInstallment
}

func makeExternalKey(bank string, date time.Time, name string, value float64, currency string, n, of int) string {
	raw := fmt.Sprintf("%s|%s|%s|%.2f|%s|%d/%d",
		bank,
		date.Format("2006-01-02"),
		strings.ToLower(strings.Join(strings.Fields(name), " ")),
		value,
		currency,
		n, of,
	)
	sum := sha1.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func cleanMerchant(name string) string {
	name = strings.TrimSpace(name)
	// Drop leading bullet / card mask lines leftovers.
	name = strings.TrimLeftFunc(name, func(r rune) bool {
		return r == '•' || r == '*' || unicode.IsSpace(r)
	})
	name = regexp.MustCompile(`(?i)^•+\s*\d+\s*`).ReplaceAllString(name, "")
	return strings.TrimSpace(name)
}

func finishLine(bank, paymentType, name string, date time.Time, value float64, currency string, forceKind string) Line {
	name = cleanMerchant(name)
	name, n, of := extractInstallment(name)
	kind, reason := classifyName(name)
	if forceKind != "" {
		kind = forceKind
		if reason == "" {
			switch forceKind {
			case KindPayment:
				reason = "bill payment"
			case KindIOF:
				reason = "IOF / FX tax"
			}
		}
	}
	if n > 0 && kind == KindPurchase {
		kind = KindInstallment
		reason = ""
	}
	if currency == "" {
		currency = "BRL"
	}
	return Line{
		Name:         name,
		OriginalName: name,
		Date:         date,
		Value:        value,
		Currency:     currency,
		Bank:         bank,
		PaymentType:  paymentType,
		Kind:         kind,
		Selected:     selectedForKind(kind),
		SkipReason:   reason,
		InstallmentN: n,
		InstallmentOf: of,
		ExternalKey:  makeExternalKey(bank, date, name, value, currency, n, of),
	}
}
