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

	// Nubank section headers and repeating page-header noise.
	comprasDeRe    = regexp.MustCompile(`(?i)^Compras de\s+(.+)$`)
	nubankPeriodRe = regexp.MustCompile(`(?i)^DE\s+\d{1,2}\s+[A-ZÇ]{3}\s+A\s+\d{1,2}\s+[A-ZÇ]{3}$`)
	nubankPageRe   = regexp.MustCompile(`(?i)^(\d+|de\s+\d+|\d+\s+de\s+\d+)$`)
	faturaLineRe   = regexp.MustCompile(`(?i)^(FATURA|EMISSÃO|EMISSAO)\b`)
	holderNameRe   = regexp.MustCompile(`^[A-ZÀ-Ÿ][A-ZÀ-Ÿ.'\s]{3,48}$`)

	longDateLineRe = regexp.MustCompile(`(?i)^(\d{1,2})\s+de\s+([a-zç.]+)\s+(\d{4})$`)
	cardHeaderRe   = regexp.MustCompile(`(?i)^CARTÃO\b`)
	cardTotalRe    = regexp.MustCompile(`(?i)^Total CARTÃO\b`)
)

// parseShortMonthLedger handles statements that use "DD MON" dates and a
// TRANSAÇÕES ledger (e.g. Nubank PDF text layout from ledongthuc/pdf).
//
// A Nubank statement repeats the "TRANSAÇÕES" header on every page and groups
// rows under origin sections ("Compras de <cardholder>", the main holder, and
// "Pagamentos e Financiamentos"). We read from the FIRST TRANSAÇÕES to the end,
// skip the repeating page-header noise and the per-section subtotal lines, and
// tag each row with its origin section.
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

	holder := detectHolder(text)
	allLines := strings.Split(text, "\n")

	// Start at the FIRST standalone "TRANSAÇÕES" line (page headers repeat it).
	start := -1
	for i, raw := range allLines {
		l := strings.TrimSpace(raw)
		if strings.EqualFold(l, "TRANSAÇÕES") || strings.EqualFold(l, "TRANSACOES") {
			start = i + 1
			break
		}
	}
	if start < 0 {
		return nil, append(warnings, "TRANSAÇÕES section not found")
	}

	origin := holder
	seen := map[string]bool{}
	var out []Line
	var curDate time.Time
	var haveDate bool
	var nameParts []string
	var usdValue float64
	var haveUSD bool
	skipNextAmount := false

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
		if value == 0 {
			return // skip zero-value rows (e.g. "Saldo restante da fatura anterior R$ 0,00")
		}
		line := finishLine(BankNubank, "credit", name, curDate, value, currency, forceKind)
		line.Origin = origin
		if seen[line.ExternalKey] {
			return
		}
		seen[line.ExternalKey] = true
		out = append(out, line)
	}

	for _, raw := range allLines[start:] {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		// Stop at the trailing legal boilerplate.
		if strings.HasPrefix(line, "Em cumprimento") ||
			strings.HasPrefix(line, "Como assegurado") {
			break
		}
		// Origin section headers (their subtotal line follows — skip it).
		if m := comprasDeRe.FindStringSubmatch(line); m != nil {
			origin = strings.TrimSpace(m[1])
			nameParts = nil
			skipNextAmount = true
			continue
		}
		if strings.EqualFold(line, "Pagamentos e Financiamentos") {
			origin = "Pagamentos e Financiamentos"
			nameParts = nil
			skipNextAmount = true
			continue
		}
		if isNubankNoise(line, holder) {
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
			if skipNextAmount {
				skipNextAmount = false
				nameParts = nil
				continue
			}
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

// detectHolder returns the statement holder's name (the ALL-CAPS line that
// precedes a "FATURA ..." line), title-cased for display. Falls back to "Titular".
func detectHolder(text string) string {
	lines := strings.Split(text, "\n")
	for i, raw := range lines {
		l := strings.TrimSpace(raw)
		if !holderNameRe.MatchString(l) || len(strings.Fields(l)) < 2 {
			continue
		}
		// The next non-empty line should be the FATURA header.
		for j := i + 1; j < len(lines); j++ {
			n := strings.TrimSpace(lines[j])
			if n == "" {
				continue
			}
			if faturaLineRe.MatchString(n) {
				return titleCasePT(l)
			}
			break
		}
	}
	return "Titular"
}

// titleCasePT lower-cases then upper-cases the first rune of each space-separated
// word (good enough for Brazilian names like "LUIZ FELIPE" → "Luiz Felipe").
func titleCasePT(s string) string {
	words := strings.Fields(strings.ToLower(s))
	for i, w := range words {
		r := []rune(w)
		if len(r) > 0 {
			r[0] = []rune(strings.ToUpper(string(r[0])))[0]
			words[i] = string(r)
		}
	}
	return strings.Join(words, " ")
}

// isNubankNoise reports whether a line is repeating page-header/section chrome
// rather than a transaction fragment.
func isNubankNoise(line, holder string) bool {
	if strings.EqualFold(line, "TRANSAÇÕES") || strings.EqualFold(line, "TRANSACOES") {
		return true
	}
	if strings.EqualFold(line, "Pagamentos") {
		return true
	}
	if faturaLineRe.MatchString(line) {
		return true
	}
	if nubankPeriodRe.MatchString(line) {
		return true
	}
	if nubankPageRe.MatchString(line) {
		return true
	}
	// Repeated ALL-CAPS holder header line.
	if holder != "" && strings.EqualFold(titleCasePT(line), holder) {
		return true
	}
	return false
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
		origin := ""

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
			line.Origin = origin
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
			if cardHeaderRe.MatchString(line) {
				origin = strings.TrimSpace(line)
				continue
			}
			if cardTotalRe.MatchString(line) {
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
