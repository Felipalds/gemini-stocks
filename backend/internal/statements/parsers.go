package statements

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// parserFunc turns statement plain text into expense lines + warnings.
type parserFunc func(text string) ([]Line, []string)

// parsers maps bank id → layout parser. Add new banks here; do not create
// bank-named source files.
var parsers = map[string]parserFunc{
	BankNubank: parseShortMonthLedger,
	BankInter:  parseLongDateLedger,
}

var (
	shortMonthDateRe = regexp.MustCompile(`(?i)^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*$`)
	shortMonthYearRe = regexp.MustCompile(`(?i)FATURA\s+\d{1,2}\s+[A-Z]{3}\s+(\d{4})`)
	cardMaskRe       = regexp.MustCompile(`(?i)^•+\s*\d+\s*$`)

	longDateLineRe = regexp.MustCompile(`(?i)^(\d{1,2})\s+de\s+([a-zç.]+)\s+(\d{4})$`)
	cardHeaderRe   = regexp.MustCompile(`(?i)^CARTÃO\b`)
	cardTotalRe    = regexp.MustCompile(`(?i)^Total CARTÃO\b`)
)

// parseShortMonthLedger handles statements that use "DD MON" dates and a
// TRANSAÇÕES ledger (e.g. Nubank PDF text layout from ledongthuc/pdf).
func parseShortMonthLedger(text string) ([]Line, []string) {
	var warnings []string
	year := 0
	if m := shortMonthYearRe.FindStringSubmatch(text); m != nil {
		year, _ = strconv.Atoi(m[1])
	}
	if year == 0 {
		year = time.Now().Year()
		warnings = append(warnings, "could not detect statement year; using current year")
	}

	idx := strings.LastIndex(strings.ToUpper(text), "TRANSAÇÕES")
	if idx < 0 {
		idx = strings.LastIndex(strings.ToUpper(text), "TRANSACOES")
	}
	if idx < 0 {
		return nil, append(warnings, "TRANSAÇÕES section not found")
	}
	section := text[idx:]

	for _, stop := range []string{
		"Em cumprimento à regulação",
		"Em cumprimento a regulacao",
		"Como assegurado pela Resolução",
	} {
		if j := strings.Index(section, stop); j > 0 {
			section = section[:j]
			break
		}
	}

	lines := strings.Split(section, "\n")
	var out []Line
	var curDate time.Time
	var haveDate bool
	var nameParts []string
	var usdValue float64
	var haveUSD bool

	flush := func(amountLine string) {
		if !haveDate || len(nameParts) == 0 {
			nameParts = nil
			haveUSD = false
			return
		}
		name := strings.TrimSpace(strings.Join(nameParts, " "))
		nameParts = nil
		value, isNeg, ok := extractBRLAbsolute(amountLine)
		if !ok {
			return
		}
		currency := "BRL"
		forceKind := ""
		lowerName := strings.ToLower(name)
		if strings.Contains(lowerName, "pagamento") || isNeg {
			forceKind = KindPayment
		}
		if strings.Contains(lowerName, "iof") {
			forceKind = KindIOF
		}
		if haveUSD && usdValue > 0 {
			currency = "USD"
			value = usdValue
		}
		haveUSD = false
		usdValue = 0
		out = append(out, finishLine(BankNubank, "credit", name, curDate, value, currency, forceKind))
	}

	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if strings.EqualFold(line, "Pagamentos") {
			continue
		}
		if cardMaskRe.MatchString(line) {
			continue
		}
		if m := shortMonthDateRe.FindStringSubmatch(line); m != nil {
			d, err := parseShortPTDate(m[1]+" "+m[2], year)
			if err == nil {
				curDate = d
				haveDate = true
			}
			nameParts = nil
			haveUSD = false
			continue
		}
		lower := strings.ToLower(line)
		if v, ok := findUSD(line); ok && !strings.Contains(lower, "conversão") && !strings.Contains(lower, "conversao") {
			haveUSD = true
			usdValue = v
			continue
		}
		if strings.Contains(lower, "conversão") || strings.Contains(lower, "conversao") {
			continue
		}
		if brlAmountRe.MatchString(line) && !strings.Contains(lower, "convers") {
			flush(line)
			continue
		}
		if haveDate {
			nameParts = append(nameParts, line)
		}
	}

	if len(out) == 0 {
		warnings = append(warnings, "no transactions parsed for short-month ledger")
	}
	return out, warnings
}

// parseLongDateLedger handles statements that use "DD de mon. YYYY" dates and
// "Despesas da fatura" sections (e.g. Inter PDF text layout).
func parseLongDateLedger(text string) ([]Line, []string) {
	var warnings []string

	sections := splitExpenseSections(text)
	if len(sections) == 0 {
		return nil, append(warnings, "Despesas da fatura section not found")
	}

	var out []Line
	seen := map[string]bool{}

	for _, section := range sections {
		lines := strings.Split(section, "\n")
		var curDate time.Time
		var haveDate bool
		var nameParts []string

		flush := func(amountLine string) {
			if !haveDate || len(nameParts) == 0 {
				nameParts = nil
				return
			}
			name := strings.TrimSpace(strings.Join(nameParts, " "))
			nameParts = nil
			value, _, ok := extractBRLAbsolute(amountLine)
			if !ok {
				return
			}
			forceKind := ""
			isCredit := strings.Contains(amountLine, "+")
			lower := strings.ToLower(name)
			if isCredit || strings.Contains(lower, "pagto") || strings.Contains(lower, "pagamento") {
				forceKind = KindPayment
			}
			if strings.Contains(lower, "iof") {
				forceKind = KindIOF
			}
			line := finishLine(BankInter, "credit", name, curDate, value, "BRL", forceKind)
			if seen[line.ExternalKey] {
				return
			}
			seen[line.ExternalKey] = true
			out = append(out, line)
		}

		for _, raw := range lines {
			line := strings.TrimSpace(raw)
			if line == "" {
				continue
			}
			if cardHeaderRe.MatchString(line) || cardTotalRe.MatchString(line) {
				continue
			}
			if line == "Data" || line == "Movimentação" || line == "Movimentacao" || line == "Beneficiário" || line == "Beneficiario" || line == "Valor" {
				continue
			}
			if longDateLineRe.MatchString(line) {
				d, err := parseLongPTDate(line)
				if err == nil {
					curDate = d
					haveDate = true
				}
				nameParts = nil
				continue
			}
			if line == "-" {
				continue
			}
			if brlAmountRe.MatchString(line) {
				flush(line)
				continue
			}
			if haveDate {
				nameParts = append(nameParts, line)
			}
		}
	}

	if len(out) == 0 {
		warnings = append(warnings, "no transactions parsed for long-date ledger")
	}
	return out, warnings
}

func splitExpenseSections(text string) []string {
	const marker = "Despesas da fatura"
	var sections []string
	rest := text
	for {
		i := strings.Index(rest, marker)
		if i < 0 {
			i = indexFold(rest, "Despesas da fatura")
			if i < 0 {
				i = indexFold(rest, "Despesas da Fatura")
			}
		}
		if i < 0 {
			break
		}
		rest = rest[i+len(marker):]
		end := len(rest)
		for _, stop := range []string{
			"Próxima fatura",
			"Proxima fatura",
			"Limite de crédito total",
			"Limite de credito total",
			"Encargos financeiros",
			"1. Pagamento total",
			"Pontos Loop",
		} {
			if j := strings.Index(rest, stop); j >= 0 && j < end {
				if stop == "Pontos Loop" && !strings.Contains(rest[:j], "CARTÃO") && !strings.Contains(rest[:j], "CARTAO") {
					continue
				}
				end = j
			}
		}
		next := strings.Index(rest, marker)
		if next < 0 {
			next = indexFold(rest, "Despesas da fatura")
		}
		if next >= 0 && next < end {
			end = next
		}
		chunk := rest[:end]
		if strings.Contains(chunk, "CARTÃO") || strings.Contains(chunk, "CARTAO") || longDateLineRe.MatchString(firstNonEmpty(chunk)) || strings.Contains(chunk, " de ") {
			sections = append(sections, chunk)
		}
		rest = rest[end:]
	}
	return sections
}

func indexFold(s, substr string) int {
	return strings.Index(strings.ToLower(s), strings.ToLower(substr))
}

func firstNonEmpty(s string) string {
	for _, line := range strings.Split(s, "\n") {
		if t := strings.TrimSpace(line); t != "" {
			return t
		}
	}
	return ""
}

// extractBRLAbsolute returns abs value and whether the amount was signed negative.
func extractBRLAbsolute(line string) (value float64, negative bool, ok bool) {
	m := brlAmountRe.FindStringSubmatch(line)
	if m == nil {
		return 0, false, false
	}
	sign := strings.TrimSpace(m[1])
	v, err := ParseAmountBR(m[2])
	if err != nil {
		return 0, false, false
	}
	neg := strings.ContainsAny(sign, "-−–") || strings.Contains(line, "-R$") || strings.Contains(line, "−R$") || strings.Contains(line, "–R$")
	if strings.Contains(line, "+") {
		neg = false
	}
	if v < 0 {
		v = -v
		neg = true
	}
	return v, neg, true
}
