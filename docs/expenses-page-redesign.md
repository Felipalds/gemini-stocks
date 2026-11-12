# Expenses page — redesign ideas & open questions

> Status: **discussion draft**. Nothing here is built yet. This is a menu of
> ideas to react to, not a plan. Scope is **frontend-first**, using the data we
> already store. Where an idea needs new backend data, it's flagged
> **[needs backend]**.
>
> Backup taken before this work: `backend/backups/stocks-20261013-000224.db`.

---

## 1. The goal (as I understood it)

Make the Expenses page **clear, clean, and practical** — it should answer, at a
glance:

1. **What do I spend the most on?** (easy today — one big line like the PS5 at R$3.5k jumps out.)
2. **What can I change in my day-to-day?** (the hard part.)
3. **Where are the micro-expenses hiding?** One big purchase is easy to see and
   track. The real blind spot is **many small expenses spread across many
   categories** — individually invisible, collectively large. The page must make
   that aggregate **visible and actionable**.

The research backs this up: the "latte factor" isn't about coffee, it's about
**attention** — small, automatic, habitual purchases that you'd never
consciously choose in bulk. ~40% of daily spending decisions are habitual, card
taps remove the "pain of paying" (people spend 12–18% more on card vs cash), and
people underestimate their recurring/subscription spend by ~R$130/month. So the
single most valuable thing this page can do is **surface the invisible**.

---

## 2. What data we already have (the raw material)

From the Go structs / table definitions — no DB inspection needed:

**`Expense`**
- `name`, `category`, `value`, `currency` (BRL/USD/BTC), `date`
- `recurring` (""=one-off, `monthly`, `annually`) — *manually* set
- `bank` ("", `nubank`, `inter`), `payment_type` ("", `credit`, `debit`, `pix`, `money`, `bitcoin`)
- `origin` (statement section / cardholder), `import_batch_id`
- `installment_n` / `installment_of` / `installment_group` (now persisted)
- `note`

**`Budget`** — `category` (""=overall monthly), `amount_brl`
**`ExpenseCategory`** — label list
**`Currency`** — code → BRL rate

**Analytics endpoint already returns:** `top_category`, `top_name`, `top_day`,
`top_month`, `category_breakdown`, `monthly_series`, `average_daily`,
`average_monthly`, `largest_single`, `largest_in_period`, `period_delta_percent`,
`period_months`, `top_5`, `budget_status`, `period_total_brl`,
`total_spent_all_time_brl`. List supports `q` search, `month`, `from`/`to`,
`category`, pagination.

**What we do NOT have (gaps worth noting):**
- **No income / salary** → can't show true cash flow, savings rate, or
  "money left this month." *(biggest gap — see Q1.)*
- **No account balances** → no forward balance projection.
- **No merchant normalization** beyond the alias feature → "merchant" grouping
  leans on the `name` field, which is messy from statements.

---

## 3. The core idea: separate "big & rare" from "small & frequent"

Today everything competes on one axis (total R$), so the PS5 dominates and the
R$2k of petshop installments or R$900/yr of coffee disappears. Proposal: **split
the view along two axes** — *size* and *frequency* — because they need different
mental models and different actions.

```
                 FREQUENT                         RARE
         ┌───────────────────────────┬───────────────────────────┐
   BIG   │  "Fixed / commitments"    │  "Big one-offs"           │
         │  rent, installments,      │  PS5, flight, appliance   │
         │  subscriptions            │  → easy to see already    │
         ├───────────────────────────┼───────────────────────────┤
  SMALL  │  ★ "Death by 1000 cuts" ★ │  "Impulse / one-time"     │
         │  coffee, delivery, apps   │  random small buys        │
         │  → THE BLIND SPOT         │                           │
         └───────────────────────────┴───────────────────────────┘
```

The top-right quadrant is already solved. The page's new job is the **bottom-left
and top-left**: making recurring/small spend legible.

---

## 4. Proposed page structure (frontend, doable now)

A clean vertical rhythm, each block answering one question. (All respects the
existing `hideValues` mask and period selector.)

### A. Header row — the "one number" + context
- **Spent this period** (big number) with **Δ vs previous period** (we have
  `period_delta_percent`) and **daily run-rate** (`average_daily`).
- Keep it to **one hero number**; avoid a wall of 9 KPI tiles. Research + viz
  best-practice: lead with the single most important figure, demote the rest.

### B. ★ "Small spend" spotlight (the new headline feature)
The thing you asked for. A card that aggregates everything under a **threshold**
into one honest number:
- "**Micro-expenses: R$X across N purchases in M categories**" — the sum of all
  transactions below the threshold, so the thousand cuts show up as one wound.
- Secondary line: *"That's Y% of your spending"* and *"≈ R$Z/year at this pace."*
- The **latte-factor projection**: "R$X/month ≈ R$ (X×12)/yr — invested at 7% that's R$… in 10y." (pure frontend math; opt-in, see Q6 — some find this motivating, others guilt-trippy.)
- Threshold is **user-configurable** (e.g. slider: "small = under R$50") OR
  auto (e.g. bottom tercile / below median). See Q3.

### C. "Where it goes" — categories, but better than a pie
- Keep the category breakdown, but as a **horizontal bar / treemap** sorted by
  total, not just a pie. Bars read exact magnitudes better than angles; a
  **treemap** shows big vs small categories in one glance and drills to merchants.
- Each row: category · total · % · **avg ticket** · **# transactions**. The avg
  ticket + count is what reveals "lots of tiny buys" vs "one big buy."
- Click → the drill-down list we already have.

### D. "Frequency leaders" / recurring radar  ★
A ranked list answering *"what do I buy over and over?"* — the heart of the
micro-expense problem:
- Group by **normalized merchant name**, show **count × avg = total** and a
  mini-sparkline of monthly occurrence.
- Sort toggle: by **total**, by **frequency**, or by **"surprise"** (small
  ticket but high total).
- **Subscription suspects** [partially needs backend]: auto-flag names that
  recur at a steady monthly cadence & amount (research: people forget ~40% of
  their subscriptions). We can heuristically detect this from repeated
  name+value monthly, in addition to the manual `recurring` flag.

### E. Trend — monthly series as a line/area
- `monthly_series` as a line with the period average as a reference line, so a
  spike/creep is obvious. Optionally stack by category (top 5 + "Other").

### F. Budgets (if used)
- `budget_status` as progress bars with pace indicator ("you're 60% through the
  month but 85% through the food budget").

### G. The list (already redesigned)
- Keep search + month filter + installment grouping. Maybe add quick chips:
  *Small only*, *Recurring only*, *By merchant*.

---

## 5. Behavioral / "save money" features (research-informed)

Ideas grounded in the behavioral-finance sources, ranked by effort:

1. **Micro-expense aggregation** (section B) — the #1 ask. Low effort, high value.
2. **Subscription / recurring radar** (section D) — "the average person
   underestimates subscriptions by R$130/mo." Medium effort.
3. **Payment-method mirror** — we store `payment_type`. Show card vs pix vs cash
   split. "Pain of paying" research: card spend is where leaks hide; seeing
   "78% of your small spend was card taps" is a nudge. Low effort, we have the data.
4. **"Autopilot" detector** — same merchant, same small amount, many times =
   habitual. Flag it gently. (Builds on D.)
5. **Weekly digest / this-week-vs-usual** — a small "this week you spent R$X,
   that's +30% vs your weekly average" callout. Low effort.
6. **Latte-factor projection** (opt-in) — see Q6; motivating for some, naggy for
   others.
7. **48-hour / impulse log** [needs backend] — a "wishlist" where you park a
   want for 48h before buying; ~70% of impulse buys lose appeal. Bigger feature.

**Deliberately NOT recommending:** blanket "never eat out" style rules or
shaming red numbers everywhere — research says rigid rules fail and guilt
backfires. Favor **awareness + gentle framing** over scolding.

---

## 6. Chart / visual guidance (keep it clean)

- **Lead with one hero number**, not a KPI wall. Group secondary stats, demote.
- **Bars/treemap over pie** for category magnitude; keep *one* pie max (or drop it).
- Every chart earns its place by answering a question in its title
  ("Where your money goes" not "Category breakdown").
- Consistent money formatting (R$, 2 decimals — just fixed), consistent colors
  per category across the whole page, dark/light safe.
- Respect `hideValues` everywhere (mask numbers, keep shapes).
- Empty/low-data states that teach rather than show a blank chart.

---

## 7. Open questions for you

Please react to these — they change the design a lot:

**Q1. Income / cash flow.** Do you want to add **income** (salary, etc.)? Right
now we only track outflows, so we can't show "money left this month,"
savings rate, or runway — only "what you spent." Adding income unlocks the most
powerful framing (the top apps all center cash-in vs cash-out). Worth it?

**Q2. Primary job of the page.** Rank these: (a) *awareness* — see where it goes;
(b) *cut spending* — find leaks to kill; (c) *budget adherence* — stay under
targets; (d) *forecast* — will I be ok this month. I'll optimize layout for your #1.

**Q3. What counts as a "micro" expense?** A fixed amount (e.g. under R$50)? A
percentile (bottom third)? A per-category relative threshold? Or a slider you
control live?

**Q4. Merchant grouping.** Imported names are messy (card descriptors). Do you
want a **merchant view** (group by name), and are you willing to occasionally
**merge/alias** names to clean it up (we already have aliasing)? Or keep
category-level only?

**Q5. Subscriptions.** Prefer **auto-detection** of recurring charges (heuristic,
sometimes wrong) or **manual tagging** only (the existing `recurring` flag), or
both (auto-suggest → you confirm)?

**Q6. Projections & nudges.** Do you want motivational framing — "this R$X/mo =
R$Y/yr invested" and weekly "you're over/under" nudges? Some people love it,
some find it preachy. In / out / only-on-a-detail-page?

**Q7. Payment method & bank.** Is the card-vs-pix-vs-cash breakdown interesting
to you, or noise? Same for per-bank (Nubank vs Inter) splits.

**Q8. Time model.** Keep the current flexible period selector (all-time / year /
90d / month)? Is **month** the main unit you think in, or weeks, or rolling 30d?

**Q9. Comparisons.** Most useful comparison: **month-over-month**, **this month
vs same month last year**, or **vs your own average**?

**Q10. Multi-currency.** You have USD/BTC expenses. Always normalize to BRL for
totals/charts (current behavior), or ever show native currency breakdowns?

**Q11. Scope creep guardrail.** Is this page just for **you**, or might others
use it? (Affects how much explanation/onboarding the UI needs.)

**Q12. Density.** Do you prefer a **dense single screen** (everything visible,
power-user) or a **progressive** layout (overview → drill into detail pages)?

---

## 8. Suggested phasing (my recommendation)

If you want a path rather than a big-bang redesign:

- **Phase 1 (frontend-only, high value):** restructure the page per §4 (hero
  number + micro-expense spotlight + category bars/treemap + frequency leaders +
  trend). Uses only existing data + a bit of client aggregation. This alone
  delivers your core ask (seeing micro-expenses together).
- **Phase 2:** subscription/recurring radar + payment-method mirror + weekly
  digest. Small backend helpers for recurring detection.
- **Phase 3 [needs backend]:** income tracking → real cash flow, savings rate,
  and forward projection. The biggest unlock, but a data-model change.

I'd start Phase 1 after you answer Q1–Q3, Q8, Q12 (those shape the skeleton);
the rest can be decided as we build.

---

## 9. Sources

- [Best Budgeting Apps of 2026 — Forbes Advisor](https://www.forbes.com/advisor/banking/best-budgeting-apps/)
- [Best expense tracker apps of 2026 — CNBC Select](https://www.cnbc.com/select/best-expense-tracker-apps/)
- [7 Best Personal Expense Tracker Apps — NerdWallet](https://www.nerdwallet.com/finance/learn/best-expense-tracker-apps)
- [Copilot Money](https://www.copilot.money/) · [Quicken Simplifi](https://www.quicken.com/products/simplifi/)
- [Expense tracker feature comparison — MoneyPatrol](https://moneypatrol.com/moneytalk/budgeting/best-personal-expense-tracker-app-features-to-compare/)
- [The Latte Factor Is Wrong (visibility bias / mental accounting) — Splitty](https://splittyapp.com/learn/latte-factor-is-wrong/)
- [The Latte Factor: small daily expenses & wealth — Thrust Finance](https://thrust.finance/learn/latte-factor-small-expenses-wealth/)
- [12 Sneaky Spending Habits That Add Up — SheBudgets](https://shebudgets.com/personal-finance/everyday-habits-that-keep-you-in-debt-without-realizing-it/)
- [Money Leaks: 14 Ways to Stop Draining Your Finances — The Fit Finance](https://thefitfinance.com/money-leaks-stop-draining-finances/)
