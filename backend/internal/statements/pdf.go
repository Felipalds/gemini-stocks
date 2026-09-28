package statements

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/ledongthuc/pdf"
)

const maxUploadBytes = 10 << 20 // 10 MB

// NormalizePDFBytes seeks to the first %PDF header. Some downloads (e.g. via
// WhatsApp) prepend null padding that breaks PDF readers.
func NormalizePDFBytes(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty file")
	}
	if len(data) > maxUploadBytes {
		return nil, fmt.Errorf("file too large (max %d bytes)", maxUploadBytes)
	}
	idx := bytes.Index(data, []byte("%PDF"))
	if idx < 0 {
		return nil, fmt.Errorf("not a PDF (missing %%PDF header)")
	}
	return data[idx:], nil
}

// ExtractText pulls plain text from every page of a PDF.
func ExtractText(data []byte) (string, error) {
	normalized, err := NormalizePDFBytes(data)
	if err != nil {
		return "", err
	}
	r, err := pdf.NewReader(bytes.NewReader(normalized), int64(len(normalized)))
	if err != nil {
		return "", fmt.Errorf("open pdf: %w", err)
	}
	var b strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		t, err := p.GetPlainText(nil)
		if err != nil {
			continue
		}
		b.WriteString(t)
		b.WriteByte('\n')
	}
	text := strings.TrimSpace(b.String())
	if text == "" {
		return "", fmt.Errorf("no extractable text in PDF")
	}
	return text, nil
}
