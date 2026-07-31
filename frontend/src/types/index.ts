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
  import_batch_id?: string;
  external_key?: string;
  value_brl?: number;
}

export interface StatementImportLine {
  name: string;
  original_name: string;
  category: string;
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

export interface ExpenseAnalytics {
  top_category: AnalyticsBucket | null;
  top_name: AnalyticsBucket | null;
  top_day: AnalyticsBucket | null;
  top_month: AnalyticsBucket | null;
  top_year: AnalyticsBucket | null;
  category_breakdown_30d: AnalyticsBucket[];
  average_daily_30d: number;
  average_monthly_12m: number;
  largest_single: {
    name: string;
    category: string;
    date: string;
    value_brl: number;
  } | null;
  mom_delta_percent: number | null;
  top_5_current_month: Array<{
    name: string;
    category: string;
    date: string;
    value_brl: number;
  }>;
  budget_status: Array<{
    category: string;
    budget_brl: number;
    spent_brl: number;
    percent_consumed: number;
  }>;
  current_month_total_brl: number;
  total_spent_all_time_brl: number;
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

export interface GoalAllocation {
  category: string;
  percentage: number;
}

export interface PortfolioGoal {
  ID?: number;
  goal_total: number;
  allocations: GoalAllocation[];
}
