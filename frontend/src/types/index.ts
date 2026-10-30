export type RecurringKind = "" | "monthly" | "annually";
export type PaymentType =
  | ""
  | "credit"
  | "debit"
  | "pix"
  | "money"
  | "bitcoin";
export type ExpenseBank = "" | "nubank" | "inter";

export interface Expense {
  ID: string;
  name: string;
  category: string;
  value: number;
  currency: "BRL" | "USD" | "BTC";
  date: string;
  note: string;
  recurring: RecurringKind;
  bank?: ExpenseBank;
  payment_type?: PaymentType;
  origin?: string;
  import_batch_id?: string;
  external_key?: string;
  value_brl?: number;
  installment_n?: number;
  installment_of?: number;
  installment_group?: string;
}

export interface StatementImportLine {
  name: string;
  original_name: string;
  category: string;
  origin: string;
  date: string;
  value: number;
  currency: string;
  bank: ExpenseBank;
  payment_type: PaymentType;
  kind: string;
  selected: boolean;
  skip_reason?: string;
  installment_n?: number;
  installment_of?: number;
  installment_group?: string;
  external_key: string;
  already_imported: boolean;
  has_alias: boolean;
}

export interface ExpenseCategory {
  ID: string;
  name: string;
}

export interface AnalyticsBucket {
  key: string;
  total_brl: number;
}

export interface ExpenseInstance {
  name: string;
  category: string;
  date: string;
  value_brl: number;
}

/** Analytics scoped to a selected period (via ?from=&to=), plus all-time totals. */
export interface ExpenseAnalytics {
  top_category: AnalyticsBucket | null;
  top_name: AnalyticsBucket | null;
  top_day: AnalyticsBucket | null;
  top_month: AnalyticsBucket | null;
  /** Category breakdown within the selected period. */
  category_breakdown: AnalyticsBucket[];
  /** Monthly totals within the period, ascending by "YYYY-MM" key. */
  monthly_series: AnalyticsBucket[];
  /** Average daily / monthly spend across the period. */
  average_daily: number;
  average_monthly: number;
  /** Largest single expense of all time. */
  largest_single: ExpenseInstance | null;
  /** Largest single expense within the selected period. */
  largest_in_period: ExpenseInstance | null;
  /** % change vs the preceding equal-length window; null for all-time ranges. */
  period_delta_percent: number | null;
  /** Calendar months spanned by the period (used to scale budgets). */
  period_months: number;
  top_5: ExpenseInstance[];
  budget_status: Array<{
    category: string;
    budget_brl: number;
    spent_brl: number;
    percent_consumed: number;
  }>;
  /** Total spent within the selected period. */
  period_total_brl: number;
  total_spent_all_time_brl: number;
}

export interface Budget {
  ID: string;
  /** Empty means the overall monthly budget; otherwise scoped to this category. */
  category: string;
  amount_brl: number;
}

export interface ExpenseTotals {
  filter: "day" | "month" | "year";
  from?: string;
  to?: string;
  buckets: AnalyticsBucket[];
}

export interface StatementImportPreview {
  bank: ExpenseBank | "";
  lines: StatementImportLine[];
  warnings: string[];
}

export interface StatementImportConfirmResult {
  import_batch_id: string;
  imported: number;
  skipped: number;
}

export interface PaginatedExpenses {
  page: number;
  page_size: number;
  total: number;
  items: Expense[];
}

export interface Transaction {
  ID: string; // <--- Mudou de number para string
  symbol: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number; // This is your PURCHASE price
  currency: string;
  fee: number;
  note: string;
  date: string;
  // Effective all-in rate (FX + IOF) from `currency` to BRL, snapshotted at the
  // purchase date. 1 for BRL; 0/undefined means "not set" → fall back to the
  // current dollar rate (never multiply by 0).
  exchange_rate?: number;

  // --- New Calculated Fields (Optional) ---
  // They are optional (?) because they might not exist
  // immediately when you create a new transaction locally.
  current_price?: number; // From Alpha Vantage
  market_value?: number; // current_price * quantity
  pnl?: number; // Profit/Loss ($)
  pnl_percent?: number; // Profit/Loss (%)
}

export interface FixedBalance {
  ID: string;
  name: string;
  amount: number;
  currency: string;
  category: string;
  note: string;
}

export interface PortfolioSnapshot {
  ID: string;
  total_value_brl: number;
  total_value_usd: number;
  total_pnl_brl: number;
  dollar_rate: number;
  holdings_json: string;
  note: string;
  CreatedAt: string;
}

export type DividendKind = "dividend" | "jcp" | "profit";

export interface Dividend {
  ID: string;
  symbol: string;
  kind: DividendKind;
  amount: number;
  /** Tax paid on this income event, in the same currency as `amount`. */
  tax?: number;
  currency: string;
  /** USD→BRL rate entered manually at record time; used to convert USD amounts. */
  dollar_rate?: number;
  date: string;
  note: string;
  value_brl?: number;
  /** "manual" (default) or "yahoo" when imported by the sync. */
  source?: string;
}

/** A computed, not-yet-saved dividend proposed by the Yahoo sync preview. */
export interface DividendCandidate {
  symbol: string;
  kind: DividendKind;
  date: string;
  per_share: number;
  shares: number;
  amount: number;
  currency: string;
  dollar_rate: number;
  value_brl: number;
  /** "new" or "probably_added" (a similar entry already exists). */
  status: "new" | "probably_added";
  note: string;
}

export interface TickerDividendBucket {
  symbol: string;
  count: number;
  total_brl: number;
}

export interface DividendSummary {
  total_brl: number;
  count: number;
  by_ticker: TickerDividendBucket[];
  by_year: AnalyticsBucket[];
  by_month: AnalyticsBucket[];
}

export interface GoalAllocation {
  category: string;
  percentage: number;
}

export interface PortfolioGoal {
  ID?: number;
  goal_total: number;
  allocations: GoalAllocation[];
}
