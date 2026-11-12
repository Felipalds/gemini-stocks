package statements

import (
	"bytes"
	"context"
	"errors"
	"testing"

	pdfcpuapi "github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpumodel "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// A tiny, valid single-page PDF with the text "Hello World".
const samplePDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 72 700 Td (Hello World) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
0000000209 00000 n
0000000300 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
372
%%EOF`

// encryptPDF protects the sample PDF with the given password.
func encryptPDF(t *testing.T, password string) []byte {
	t.Helper()
	conf := pdfcpumodel.NewDefaultConfiguration()
	conf.UserPW = password
	conf.OwnerPW = password
	var out bytes.Buffer
	if err := pdfcpuapi.Encrypt(context.Background(), bytes.NewReader([]byte(samplePDF)), &out, conf); err != nil {
		t.Fatalf("encrypt sample pdf: %v", err)
	}
	return out.Bytes()
}

func TestDecryptIfEncrypted_Plain(t *testing.T) {
	out, err := decryptIfEncrypted([]byte(samplePDF), "")
	if err != nil {
		t.Fatalf("plain pdf should not error: %v", err)
	}
	if !bytes.Equal(out, []byte(samplePDF)) {
		t.Fatal("plain pdf bytes should be returned unchanged")
	}
}

func TestDecryptIfEncrypted_CorrectPassword(t *testing.T) {
	enc := encryptPDF(t, "secret")
	out, err := decryptIfEncrypted(enc, "secret")
	if err != nil {
		t.Fatalf("correct password should decrypt: %v", err)
	}
	if len(out) == 0 {
		t.Fatal("decrypted output is empty")
	}
	// The decrypted bytes must themselves no longer require a password.
	if _, err := decryptIfEncrypted(out, ""); err != nil {
		t.Fatalf("decrypted pdf should no longer be encrypted: %v", err)
	}
}

func TestDecryptIfEncrypted_MissingPassword(t *testing.T) {
	enc := encryptPDF(t, "secret")
	_, err := decryptIfEncrypted(enc, "")
	if !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("empty password should yield ErrPasswordRequired, got %v", err)
	}
}

func TestDecryptIfEncrypted_WrongPassword(t *testing.T) {
	enc := encryptPDF(t, "secret")
	_, err := decryptIfEncrypted(enc, "nope")
	if !errors.Is(err, ErrWrongPassword) {
		t.Fatalf("wrong password should yield ErrWrongPassword, got %v", err)
	}
}

func TestExtractText_EncryptedRoundTrip(t *testing.T) {
	enc := encryptPDF(t, "secret")

	if _, err := ExtractText(enc, ""); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("expected ErrPasswordRequired without password, got %v", err)
	}
	text, err := ExtractText(enc, "secret")
	if err != nil {
		t.Fatalf("ExtractText with correct password failed: %v", err)
	}
	if text == "" {
		t.Fatal("expected extracted text from decrypted pdf")
	}
}
