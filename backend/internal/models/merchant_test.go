package models

import "testing"

func TestNormalizeMerchantKey(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"COMERCIAL", "comercial"},
		{"  Dl *Uberrides  ", "dl *uberrides"},
		{"Foo   Bar", "foo bar"},
		{"", ""},
	}
	for _, c := range cases {
		if got := NormalizeMerchantKey(c.in); got != c.want {
			t.Fatalf("%q: got %q want %q", c.in, got, c.want)
		}
	}
}
