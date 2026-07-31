package statements

import (
	"strings"
	"testing"
	"time"
)

func TestDetectBank_Nubank(t *testing.T) {
	text := "Nu Pagamentos S.A.\nCNPJ 18.236.120/0001-58\nTRANSAÇÕES DE 01 JUN A 01 JUL"
	bank, conf := DetectBank(text)
	if bank != BankNubank {
		t.Fatalf("got bank %q", bank)
	}
	if conf < 0.4 {
		t.Fatalf("low confidence %v", conf)
	}
}

func TestDetectBank_Inter(t *testing.T) {
	text := "Banco Inter S/A\nDespesas da fatura\nPontos Loop\nwww.bancointer.com.br"
	bank, conf := DetectBank(text)
	if bank != BankInter {
		t.Fatalf("got bank %q", bank)
	}
	if conf < 0.4 {
		t.Fatalf("low confidence %v", conf)
	}
}

func TestDetectBank_Unknown(t *testing.T) {
	bank, conf := DetectBank("random grocery receipt")
	if bank != BankUnknown || conf != 0 {
		t.Fatalf("got %q conf %v", bank, conf)
	}
}

func TestNormalizePDFBytes_LeadingNulls(t *testing.T) {
	raw := append(make([]byte, 100), []byte("%PDF-1.7\nstuff")...)
	got, err := NormalizePDFBytes(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(got), "%PDF") {
		t.Fatalf("prefix %q", string(got[:4]))
	}
}

func TestNormalizePDFBytes_NotPDF(t *testing.T) {
	_, err := NormalizePDFBytes([]byte("hello"))
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParseAmountBR(t *testing.T) {
	v, err := ParseAmountBR("1.426,74")
	if err != nil || v != 1426.74 {
		t.Fatalf("got %v %v", v, err)
	}
}

func TestParse_ShortMonthLedgerFixture(t *testing.T) {
	text := `
LUIZ TESTE
FATURA 08 JUL 2026
EMISSÃO E ENVIO 01 JUL 2026
TRANSAÇÕES
DE 01 JUN A 01 JUL
Titular
R$ 100,00
01 JUN

•••• 1111
Loja Exemplo - Parcela 2/5
R$ 23,99
04 JUN

•••• 2222
Dl*Uberrides
R$ 14,98
06 JUN
IOF de "MerchantFX"
R$ 0,93
06 JUN

•••• 3333
MerchantFX
USD 5.00
Conversão: USD 1 = R$ 5,33
R$ 26,65
02 JUN
Pagamento em 02 JUN
−R$ 50,00
Em cumprimento à regulação do Banco Central, resto
`
	prev, err := Parse(text, BankNubank)
	if err != nil {
		t.Fatal(err)
	}
	lines := prev.Lines
	if len(lines) != 5 {
		t.Fatalf("expected 5 lines, got %d: %+v", len(lines), lines)
	}

	parc := lines[0]
	if parc.Kind != KindInstallment || parc.InstallmentN != 2 || parc.InstallmentOf != 5 {
		t.Fatalf("installment: %+v", parc)
	}
	if !parc.Selected || parc.Value != 23.99 || parc.Name != "Loja Exemplo" {
		t.Fatalf("installment fields: %+v", parc)
	}

	uber := lines[1]
	if uber.Kind != KindPurchase || !uber.Selected || uber.Value != 14.98 {
		t.Fatalf("uber: %+v", uber)
	}

	iof := lines[2]
	if iof.Kind != KindIOF || iof.Selected {
		t.Fatalf("iof should be unchecked: %+v", iof)
	}

	fx := lines[3]
	if fx.Currency != "USD" || fx.Value != 5.0 || !fx.Selected {
		t.Fatalf("fx: %+v", fx)
	}

	pay := lines[4]
	if pay.Kind != KindPayment || pay.Selected {
		t.Fatalf("payment should be unchecked: %+v", pay)
	}

	if parc.ExternalKey == "" || parc.ExternalKey == uber.ExternalKey {
		t.Fatal("external keys should be unique and set")
	}
}

func TestParse_LongDateLedgerFixture(t *testing.T) {
	text := `
Despesas da fatura
CARTÃO 5364****2809
Data
Movimentação
Beneficiário
Valor
01 de jun. 2026
PAGTO DEBITO AUTOMATICO
-
+ R$ 100,00
05 de jun. 2026
ABAST SHELL BOX
-
R$ 200,00
09 de mar. 2026
ESTRELA MANIPULACAO
(Parcela 03 de 06)
-
R$ 27,46
07 de jun. 2026
IOF INTERNACIONAL
-
R$ 3,85
Próxima fatura
Data de corte: 23/07/2026
Movimentação Valor
ESTRELA MANIPULACAO (Parcela 04 de 06) R$ 27,46
`
	prev, err := Parse(text, BankInter)
	if err != nil {
		t.Fatal(err)
	}
	lines := prev.Lines
	if len(lines) != 4 {
		t.Fatalf("expected 4 lines (future parcels omitted), got %d: %+v", len(lines), lines)
	}

	if lines[0].Kind != KindPayment || lines[0].Selected {
		t.Fatalf("payment: %+v", lines[0])
	}
	if lines[1].Kind != KindPurchase || !lines[1].Selected || lines[1].Value != 200 {
		t.Fatalf("purchase: %+v", lines[1])
	}
	if lines[2].Kind != KindInstallment || lines[2].InstallmentN != 3 || lines[2].InstallmentOf != 6 {
		t.Fatalf("installment: %+v", lines[2])
	}
	if lines[2].Date.Month() != time.March {
		t.Fatalf("installment date: %v", lines[2].Date)
	}
	if lines[3].Kind != KindIOF || lines[3].Selected {
		t.Fatalf("iof: %+v", lines[3])
	}
}

func TestParse_AutoDetect(t *testing.T) {
	text := `Nu Pagamentos S.A.
CNPJ 18.236.120/0001-58
FATURA 08 JUL 2026
TRANSAÇÕES
DE 01 JUN A 01 JUL
01 JUN

•••• 1111
Cafe
R$ 10,00
`
	prev, err := Parse(text, "auto")
	if err != nil {
		t.Fatal(err)
	}
	if prev.Bank != BankNubank {
		t.Fatalf("bank %q", prev.Bank)
	}
	if len(prev.Lines) != 1 {
		t.Fatalf("lines %d", len(prev.Lines))
	}
}

func TestMakeExternalKey_Stable(t *testing.T) {
	d := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	a := makeExternalKey(BankNubank, d, "Cafe", 10, "BRL", 0, 0)
	b := makeExternalKey(BankNubank, d, "Cafe", 10, "BRL", 0, 0)
	c := makeExternalKey(BankNubank, d, "Cafe", 11, "BRL", 0, 0)
	if a != b || a == c {
		t.Fatalf("stability failed %s %s %s", a, b, c)
	}
}
