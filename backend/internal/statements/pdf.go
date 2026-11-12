package statements

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/ledongthuc/pdf"
	pdfcpuapi "github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	pdfcpumodel "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

const maxUploadBytes = 10 << 20 // 10 MB

// ErrPasswordRequired signals that the PDF is encrypted and no (or an empty)
// password was supplied. The frontend uses this to prompt the user for one.
var ErrPasswordRequired = errors.New("pdf is password protected")

// ErrWrongPassword signals that a password was supplied but didn't unlock the PDF.
var ErrWrongPassword = errors.New("incorrect pdf password")

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

// decryptIfEncrypted returns a plain, unencrypted copy of the PDF. If the file
// is not encrypted it is returned unchanged. Encrypted files (e.g. Inter credit
// card statements) are decrypted with the supplied password; a missing or wrong
// password yields ErrPasswordRequired / ErrWrongPassword so callers can prompt.
func decryptIfEncrypted(data []byte, password string) ([]byte, error) {
	conf := pdfcpumodel.NewDefaultConfiguration()
	// Banks protect statements with a user (open) password; try it as both the
	// user and owner password so either encryption style unlocks.
	conf.UserPW = password
	conf.OwnerPW = password

	var out bytes.Buffer
	err := pdfcpuapi.Decrypt(context.Background(), bytes.NewReader(data), &out, conf)
	switch {
	case err == nil:
		return out.Bytes(), nil
	case errors.Is(err, pdfcpu.ErrNotEncrypted):
		// Not encrypted — nothing to do, use the original bytes.
		return data, nil
	case errors.Is(err, pdfcpu.ErrWrongPassword),
		errors.Is(err, pdfcpu.ErrOwnerPasswordRequired):
		if strings.TrimSpace(password) == "" {
			return nil, ErrPasswordRequired
		}
		return nil, ErrWrongPassword
	default:
		return nil, fmt.Errorf("decrypt pdf: %w", err)
	}
}

// ExtractText pulls plain text from every page of a PDF, decrypting first when
// the file is password protected.
func ExtractText(data []byte, password string) (string, error) {
	normalized, err := NormalizePDFBytes(data)
	if err != nil {
		return "", err
	}
	normalized, err = decryptIfEncrypted(normalized, password)
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
