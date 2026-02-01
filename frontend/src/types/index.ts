export interface Transaction {
  ID: string; // <--- Mudou de number para string
  symbol: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number; // This is your PURCHASE price
  currency: string;
  note: string;
  date: string;

  // --- New Calculated Fields (Optional) ---
  // They are optional (?) because they might not exist
  // immediately when you create a new transaction locally.
  current_price?: number; // From Twelvedata
  market_value?: number; // current_price * quantity
  pnl?: number; // Profit/Loss ($)
  pnl_percent?: number; // Profit/Loss (%)
}
