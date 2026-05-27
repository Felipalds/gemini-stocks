# Gemini Stocks 📈

> A professional (vibe-coded), full-stack stock portfolio manager built with Go and React, featuring real-time price synchronization via Alpha Vantage and an Atomic Design architecture.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Go](https://img.shields.io/badge/backend-Go-00ADD8.svg)
![React](https://img.shields.io/badge/frontend-React-61DAFB.svg)

## 🚀 Features

* **Full CRUD Transactions:** Create, Read, and Delete stock transactions with UUIDs.
* **Real-time Market Data:** Integration with **Alpha Vantage API** to fetch live stock prices.
* **Performance Tracking:** Automatic calculation of **Profit & Loss (PnL)** in dollars and percentage.
* **Background Worker:** Automated background jobs to keep prices cached and updated.
* **Modern UI/UX:** Built with **Shadcn/ui**, featuring specific status badges, responsive tables, and toasts notifications (Sonner).
* **Atomic Design:** Frontend architecture organized into Atoms, Molecules, Organisms, and Templates.


## 🛠 Tech Stack

### Backend
* **Language:** [Go (Golang)](https://go.dev/)
* **Router:** [Chi v5](https://github.com/go-chi/chi)
* **Database:** SQLite with [GORM](https://gorm.io/)
* **Logging:** [Uber Zap](https://github.com/uber-go/zap)
* **Utils:** UUID generation, Background Workers.

### Frontend
* **Framework:** [React](https://react.dev/) + [Vite](https://vitejs.dev/)
* **Language:** TypeScript
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **UI Library:** [Shadcn/ui](https://ui.shadcn.com/)
* **State/Routing:** React Router DOM, React Hook Form, Zod Validation.

---

## ⚙️ Getting Started

### Prerequisites
* **Go** 1.21 or higher
* **Node.js** 18 or higher
* **Alpha Vantage API Key** (Free tier available at [alphavantage.co](https://www.alphavantage.co/support/#api-key))
