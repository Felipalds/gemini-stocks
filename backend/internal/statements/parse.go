package statements

import "fmt"

// Parse runs bank detection (unless bankOverride is set) and the matching
// registered parser from `parsers`.
func Parse(text string, bankOverride string) (*Preview, error) {
	bank := bankOverride
	var warnings []string

	if bank == "" || bank == "auto" {
		detected, conf := DetectBank(text)
		if detected == BankUnknown || conf < 0.4 {
			return &Preview{
				Bank:     BankUnknown,
				Warnings: []string{"could not detect bank; pass bank=nubank or bank=inter"},
			}, fmt.Errorf("bank not detected")
		}
		bank = detected
		if conf < 0.7 {
			warnings = append(warnings, fmt.Sprintf("low detection confidence (%.2f) for %s", conf, bank))
		}
	}

	fn, ok := parsers[bank]
	if !ok {
		return nil, fmt.Errorf("unsupported bank %q", bank)
	}
	lines, w := fn(text)
	warnings = append(warnings, w...)

	return &Preview{
		Bank:     bank,
		Lines:    lines,
		Warnings: warnings,
	}, nil
}

// ParsePDFBytes normalizes, extracts text, and parses.
func ParsePDFBytes(data []byte, bankOverride string) (*Preview, error) {
	text, err := ExtractText(data)
	if err != nil {
		return nil, err
	}
	return Parse(text, bankOverride)
}
