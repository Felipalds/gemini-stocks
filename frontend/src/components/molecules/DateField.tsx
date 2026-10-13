import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  /** Canonical value as "YYYY-MM-DD" (empty string when unset). */
  value: string;
  /** Emits "YYYY-MM-DD" (or "" when the field is cleared). */
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

// "YYYY-MM-DD" -> "DD/MM/YYYY" for display.
function isoToText(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

// Progressive mask: keep digits only (max 8), group as DD/MM/YYYY while typing.
function maskText(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join("/");
}

// "DD/MM/YYYY" (any separators) -> "YYYY-MM-DD", or null if incomplete/invalid.
function textToIso(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const yyyy = Number(digits.slice(4, 8));
  if (yyyy < 1900 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // Reject overflow like 31/02 by round-tripping through Date.
  const dt = new Date(yyyy, mm - 1, dd);
  if (
    dt.getFullYear() !== yyyy ||
    dt.getMonth() !== mm - 1 ||
    dt.getDate() !== dd
  ) {
    return null;
  }
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

/**
 * A writable date field in DD/MM/YYYY format (typed as a plain string), with a
 * calendar icon that opens the browser's native date picker. The value in/out is
 * always canonical "YYYY-MM-DD".
 */
export function DateField({
  value,
  onChange,
  id,
  className,
  disabled,
  required,
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToText(value));
  const [lastValue, setLastValue] = useState(value);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Resync the visible text when the value changes externally (calendar pick,
  // form reset, editing a different row). Adjusting state during render is the
  // idiomatic way to mirror a prop without an effect.
  if (value !== lastValue) {
    setLastValue(value);
    setText(isoToText(value));
  }

  const handleText = (raw: string) => {
    const masked = maskText(raw);
    setText(masked);
    if (masked === "") {
      onChange("");
      return;
    }
    const iso = textToIso(masked);
    if (iso) onChange(iso);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="DD/MM/AAAA"
        value={text}
        disabled={disabled}
        required={required}
        onChange={(e) => handleText(e.target.value)}
        // On blur, snap back to the canonical formatting of the committed value
        // (discards half-typed / invalid input).
        onBlur={() => setText(isoToText(value))}
        className="pr-9"
      />
      <button
        type="button"
        disabled={disabled}
        aria-label="Open calendar"
        onClick={openPicker}
        className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      {/* Hidden native date input backs the calendar icon. */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-2 bottom-0 h-0 w-0 opacity-0"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
