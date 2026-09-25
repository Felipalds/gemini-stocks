# Gemini Stocks 📈

> A professional (vibe-coded), full-stack stock portfolio manager built with Go and React, featuring real-time price synchronization via Alpha Vantage and an Atomic Design architecture.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Go](https://img.shields.io/badge/backend-Go-00ADD8.svg)
![React](https://img.shields.io/badge/frontend-React-61DAFB.svg)

## 🚀 Features

* **Full CRUD Transactions:** Create, Read, and Delete stock transactions with UUIDs.
* **Market Data (cached):** Integration with **Alpha Vantage API** to fetch stock prices and FX rates.
* **Same-day Alpha cache:** `POST /prices/refresh` uses each ticker’s / currency’s `updated_at` and **will not call Alpha twice for the same symbol (or USD/BTC FX) on the same calendar day** — so Sync Prices is safe to click repeatedly without burning free-tier credits. New symbols still fetch on first insert.
* **Performance Tracking:** Automatic calculation of **Profit & Loss (PnL)** in dollars and percentage.
* **Modern UI/UX:** Built with **Shadcn/ui**, featuring specific status badges, responsive tables, and toasts notifications (Sonner).
* **Atomic Design:** Frontend architecture organized into Atoms, Molecules, Organisms, and Templates.


## 🛠 Tech Stack

### Backend
* **Language:** [Go (Golang)](https://go.dev/)
* **Router:** [Chi v5](https://github.com/go-chi/chi)
* **Database:** SQLite with [GORM](https://gorm.io/)
* **Logging:** [Uber Zap](https://github.com/uber-go/zap)
* **Utils:** UUID generation; price cache via `tickers.updated_at` / `currencies.updated_at`.

### Frontend
* **Framework:** [React](https://react.dev/) + [Vite](https://vitejs.dev/)
* **Language:** TypeScript
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **UI Library:** [Shadcn/ui](https://ui.shadcn.com/)
* **State/Routing:** React Router DOM, React Hook Form, Zod Validation.

---

## Price refresh & Alpha credits

Manual sync (`POST /prices/refresh` from the UI) walks cached `tickers` and FX (`USD`, `BTC` → BRL). For each row:

1. If `updated_at` is **today** (server local date) → **skip** (no Alpha call).
2. Otherwise → fetch from Alpha, then set `updated_at` to now.

**Single-ticker force refresh:** `POST /prices/refresh-one?symbol=BTC/USD` always calls Alpha for that symbol and **bypasses** the once-per-day lock (used from the stock detail dialog “Update price” button). Symbol is a query param so slashes in pairs like `BTC/USD` work; `buildAlphaSymbol` strips `/` before calling Alpha (`BTCUSD`). Prefer this for one asset instead of a full portfolio sync.

This is intentional: free Alpha tiers rate-limit hard. Do **not** add a second *bulk* refresh path without respecting the same-day cache. Fixed-balance symbols (renda fixa) are never sent to Alpha.

## Portfolio snapshots (evolution chart)

Home can show a **line chart** of portfolio totals over time. Snapshots are **automatic**: opening the app calls `POST /snapshots`, which stores current total BRL / USD / PnL / FX (plus holdings JSON) **at most once per calendar day**. If a snapshot already exists for today, the API returns it and does not create another. List with `GET /snapshots`. This does **not** call Alpha — it only freezes whatever is already in your DB.

---

## ⚙️ Getting Started

### Prerequisites
* **Go** 1.21 or higher
* **Node.js** 18 or higher
* **Alpha Vantage API Key** (Free tier available at [alphavantage.co](https://www.alphavantage.co/support/#api-key))
