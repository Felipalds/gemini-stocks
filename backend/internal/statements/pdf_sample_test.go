package statements

import (
	"os"
	"path/filepath"
	"testing"
)

func repoRootPDF(name string) string {
	// tests run from package dir; PDFs live at repo root
	candidates := []string{
		filepath.Join("..", "..", "..", name),
		filepath.Join("..", "..", name),
		name,
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

func TestParsePDFBytes_ShortMonthSample(t *testing.T) {
	path := repoRootPDF("Nubank_2026-07-08.pdf")
	if path == "" {
		t.Skip("sample short-month ledger PDF not present")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	prev, err := ParsePDFBytes(data, BankNubank)
	if err != nil {
		t.Fatal(err)
	}
	if prev.Bank != BankNubank {
		t.Fatalf("bank %q", prev.Bank)
	}
	if len(prev.Lines) < 5 {
		t.Fatalf("expected several lines, got %d warnings=%v", len(prev.Lines), prev.Warnings)
	}
	var purchases, payments, iofs int
	for _, l := range prev.Lines {
		switch l.Kind {
		case KindPurchase, KindInstallment:
			purchases++
			if !l.Selected {
				t.Errorf("purchase/installment should be selected: %s", l.Name)
			}
		case KindPayment:
			payments++
			if l.Selected {
				t.Errorf("payment should be unchecked: %s", l.Name)
			}
		case KindIOF:
			iofs++
			if l.Selected {
				t.Errorf("iof should be unchecked: %s", l.Name)
			}
		}
	}
	if purchases == 0 || payments == 0 {
		t.Fatalf("counts purchases=%d payments=%d iofs=%d", purchases, payments, iofs)
	}
}

func TestParsePDFBytes_LongDateSample(t *testing.T) {
	path := repoRootPDF("fatura-inter-2026-06.pdf")
	if path == "" {
		t.Skip("sample long-date ledger PDF not present")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	prev, err := ParsePDFBytes(data, BankInter)
	if err != nil {
		t.Fatal(err)
	}
	if prev.Bank != BankInter {
		t.Fatalf("bank %q", prev.Bank)
	}
	if len(prev.Lines) < 10 {
		t.Fatalf("expected many lines, got %d warnings=%v", len(prev.Lines), prev.Warnings)
	}
	var selected int
	for _, l := range prev.Lines {
		if l.Selected {
			selected++
		}
		if l.Kind == KindPayment && l.Selected {
			t.Errorf("payment selected: %s", l.Name)
		}
	}
	if selected == 0 {
		t.Fatal("expected some selected purchases")
	}
}
