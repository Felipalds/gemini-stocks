import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  BookOpen,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";

// The in-app, designed view of the project's design decisions. The raw/source
// version lives in docs/Q&A.md; keep the two in sync when decisions change.

interface QA {
  q: string;
  a: ReactNode;
}
interface Section {
  id: string;
  title: string;
  items: QA[];
}

const SECTIONS: Section[] = [
  {
    id: "fx-cost",
    title: "Purchase-day FX cost (BRL reality)",
    items: [
      {
        q: "How is a US stock buy saved, and at which dollar rate?",
        a: "As a transaction with the USD price, plus a snapshotted effective USD→BRL rate for the purchase date (Yahoo close on/before that day). Market value still uses today's rate; cost uses the historical one.",
      },
      {
        q: "Does the stored rate drive cost basis & PnL?",
        a: "Yes. BRL invested/profit reflect reais really spent, so the currency (FX) gain becomes visible. Current market value is unchanged.",
      },
      {
        q: "AutoMigrate defaults old rows to 0 — won't that zero out BRL totals?",
        a: (
          <>
            No. <code>0</code> means “unset” and callers fall back to today's rate
            (<code>rate = exchange_rate &gt; 0 ? exchange_rate : dollarRate</code>)
            — never a multiply-by-zero.
          </>
        ),
      },
    ],
  },
  {
    id: "iof",
    title: "IOF (foreign-exchange tax)",
    items: [
      {
        q: "What IOF is applied?",
        a: "A fixed, configurable rate with different values for buy and sell, added on top of the market rate. Stored in the DB and editable on the Settings page.",
      },
      {
        q: "What happens when the government changes IOF?",
        a: "Edit it in Settings. The effective rate is snapshotted on each transaction at write time, so a change only affects future transactions — history stays correct.",
      },
    ],
  },
  {
    id: "backfill",
    title: "Existing transactions",
    items: [
      {
        q: "How do older transactions get a rate?",
        a: "Auto-estimate, then editable: Settings → Run backfill fills rows that have no rate (historical FX + current IOF). Then correct individual rows against broker notes for exact figures.",
      },
    ],
  },
  {
    id: "btc",
    title: "Bitcoin",
    items: [
      {
        q: "How is BTC stored, and does it need special handling?",
        a: (
          <>
            Stored as <code>BTC/USD</code> with <code>currency = USD</code>, so it
            flows through the same path as US stocks — no special code. BTC bought
            in BRL uses rate 1.
          </>
        ),
      },
    ],
  },
  {
    id: "toggle",
    title: "Currency view (BRL ⇄ USD)",
    items: [
      {
        q: "Can values be shown in both, with a button to switch?",
        a: "Yes — a global toggle in the header plus a per-card override button. Each card also shows a secondary line in the opposite currency.",
      },
      {
        q: "What's the difference between the two views?",
        a: "BRL is FX-aware (cost at the historical rate). USD is per-asset: USD-native positions show real dollars (pure-USD PnL, no FX); BRL/mixed positions convert at today's rate.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings page",
    items: [
      {
        q: "Where is configuration edited?",
        a: "A Settings page in the ☰ menu: USD rate (manual), IOF buy/sell, and the backfill action. Built as a singleton settings row so profile/preferences can be added later.",
      },
    ],
  },
  {
    id: "pdf-password",
    title: "Password-protected statement PDFs",
    items: [
      {
        q: "Inter now locks its credit-card PDF with a password — can I still import it?",
        a: (
          <>
            Yes. The import upload accepts an optional <code>password</code>, and
            the backend decrypts the PDF in memory (via <code>pdfcpu</code>) before
            the usual text extraction. Unencrypted files are untouched; the
            password is only used to decrypt and is never stored.
          </>
        ),
      },
      {
        q: "How does the app know to ask for the password?",
        a: (
          <>
            A locked PDF returns <code>422</code> with{" "}
            <code>password_required: true</code>. The Expenses page keeps the
            chosen file, opens a password dialog, and re-uploads the same file with
            what you type. A wrong password reopens the dialog with an inline error.
          </>
        ),
      },
    ],
  },
  {
    id: "category-select",
    title: "Category combobox inside dialogs",
    items: [
      {
        q: "Why couldn't I type in the category search when importing a credit-card statement?",
        a: (
          <>
            The category combobox is a Radix Popover whose content was portaled to{" "}
            <code>document.body</code>. Inside the modal import Dialog, the dialog's
            focus trap sat between that body-level popover and its search input:
            clicks worked (the popover is <code>modal</code>) but keystrokes were
            pulled back into the dialog. Fix: the popover now portals into the
            nearest <code>[role="dialog"]</code> element, so the search input lives
            inside the dialog's focus scope and accepts typing.
          </>
        ),
      },
    ],
  },
];

const BACKEND_STATUS = [
  "Encrypted PDF import: password form field + pdfcpu decrypt",
  "Transaction.ExchangeRate column",
  "Setting singleton + GET/PUT /settings",
  "GetHistoricalRate (USDBRL=X)",
  "computeExchangeRate on create/update/import",
  "GET /currencies/rate, PUT /currencies/usd",
  "POST /transactions/backfill-rates",
  "Unit tests: pickHistoricalClose, IOF, settings",
];

const FRONTEND_STATUS = [
  "Password prompt + retry for encrypted statement imports",
  "exchange_rate on Transaction + editable form field",
  "Dashboard + PortfolioSummary split cost vs market",
  "Global + per-card BRL⇄USD toggle",
  "Settings page & Q&A page in ☰ menu",
  "rates.ts helpers + vitest tests",
];

const RESOLVED = [
  "Settings first-pass scope: USD rate + IOF buy/sell + backfill (profile later).",
  'There is no "point 3" — it was never intended.',
];

const APPROXIMATIONS = [
  "Backfill applies current IOF to old rows (historical IOF not tracked).",
  "Yahoo USDBRL=X close ≠ broker/PTAX rate exactly — edit per transaction.",
];

function StatusList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function QAPage() {
  return (
    <div className="min-h-screen bg-muted/40 p-6 sm:p-8 font-sans">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Q&amp;A / Project Docs
              </h1>
              <p className="mt-1 text-muted-foreground">
                Living record of design decisions. Source of truth:{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  docs/Q&amp;A.md
                </code>
                .
              </p>
            </div>
          </div>
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
          {/* Table of contents */}
          <nav className="hidden lg:block">
            <div className="sticky top-8 space-y-1">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contents
              </p>
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </nav>

          <div className="space-y-6">
            {SECTIONS.map((section) => (
              <Card key={section.id} id={section.id} className="scroll-mt-8">
                <CardHeader>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {section.items.map((item, i) => (
                    <div
                      key={i}
                      className="border-l-2 border-primary/30 pl-4"
                    >
                      <p className="font-semibold text-foreground">{item.q}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            {/* Implementation status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Implementation status</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <Badge variant="secondary">Backend</Badge>
                  <StatusList items={BACKEND_STATUS} />
                </div>
                <div className="space-y-3">
                  <Badge variant="secondary">Frontend</Badge>
                  <StatusList items={FRONTEND_STATUS} />
                </div>
              </CardContent>
            </Card>

            {/* Resolved */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CircleCheck className="h-5 w-5 text-emerald-600" />
                  Resolved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {RESOLVED.map((r) => (
                    <li
                      key={r}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Circle className="mt-1 h-3 w-3 shrink-0 fill-emerald-600/20 text-emerald-600" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Known approximations */}
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Known approximations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {APPROXIMATIONS.map((a) => (
                    <li
                      key={a}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <p className="pb-4 text-center text-xs text-muted-foreground">
              See also{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                docs/currency-and-fx.md
              </code>{" "}
              for full feature documentation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
