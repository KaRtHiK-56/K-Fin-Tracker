<div align="center">

# 💰 K-Fin Tracker

### Your complete personal finance dashboard for Indian investors

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://k-fin-tracker01.vercel.app)
[![Built with React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

![K-Fin Tracker Banner](https://img.shields.io/badge/NSE%20%7C%20BSE-Live%20Prices-8B5CF6?style=for-the-badge)
![Monthly Cost](https://img.shields.io/badge/Monthly%20Cost-₹0.00-10B981?style=for-the-badge)

</div>

---

## 📌 Overview

K-Fin Tracker is a **fully private, self-hosted personal finance dashboard** built specifically for Indian investors. Track your stocks, mutual funds, gold, fixed deposits, expenses, and income — all in one place. Built with modern web technologies and deployed for free.

> 🔒 **Privacy first** — Your data is never shared. Row Level Security ensures only you can see your financial data. The app is not indexed by search engines.

---

## ✨ Features

### ✅ Phase 1 — Live Now
| Module | Description |
|---|---|
| 📈 **Stock Tracker** | NSE/BSE live prices, P&L, sector allocation, health score |
| 🔐 **Google Auth** | Secure login via Google OAuth — only you can access your data |
| 🌓 **Light / Dark mode** | Violet + White and Violet + Black themes with toggle |
| 📊 **Portfolio Analytics** | Total invested, current value, day P&L, diversification score |
| 🛡️ **Intrusion Alerts** | Push notification to your phone if unknown user logs in |

### 🔄 Phase 2 — Coming Soon
| Module | Description |
|---|---|
| 🎯 **Mutual Funds** | SIP tracker, NAV from AMFI, XIRR calculator |
| 🥇 **Gold Tracker** | Physical, SGB, Digital Gold, ETF with MCX live rates |
| 🏦 **FD / RD Tracker** | Maturity countdown, interest calculator, auto-renewal alerts |
| 💸 **Expense Tracker** | Category-wise spending, budget vs actual, monthly trends |
| 💰 **Income Tracker** | Salary, freelance, dividends, rental income |
| 🔄 **SIP Calculator** | Future value projections with inflation adjustment |
| 🧾 **Tax Planner** | 80C, 80D, LTCG optimiser, tax-loss harvesting |
| 💼 **Net Worth** | Complete asset vs liability dashboard with history |

---

## 🛠️ Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | Free |
| **Styling** | CSS Modules + CSS Variables (light/dark) | Free |
| **Charts** | Chart.js + react-chartjs-2 | Free |
| **Auth + Database** | Supabase (Postgres + Google OAuth + RLS) | Free |
| **Stock Prices** | Yahoo Finance via free REST proxy | Free |
| **Hosting** | Vercel | Free |
| **CI/CD** | GitHub Actions | Free |
| **Notifications** | ntfy.sh push alerts | Free |
| **Total** | | **₹0 / month** |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free)
- A [Vercel](https://vercel.com) account (free)
- A [Google Cloud Console](https://console.cloud.google.com) project (free)

### 1. Clone the repo

```bash
git clone https://github.com/KaRtHiK-56/K-Fin-Tracker.git
cd K-Fin-Tracker/K-Fin-Tracker
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run the entire contents of `supabase/schema.sql`
3. Go to **Authentication → Sign In / Providers → Google** → enable it
4. Go to **Authentication → URL Configuration** → set:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/**`
5. Copy your **Project URL** and **anon key** from **Settings → API**

### 4. Set up Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → **APIs & Services → OAuth consent screen** → External
3. **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
4. Add to **Authorised JavaScript origins**: `https://your-app.vercel.app`
5. Add to **Authorised redirect URIs**: `https://xxxx.supabase.co/auth/v1/callback`
6. Copy the **Client ID** and **Client Secret** → paste into Supabase Google provider

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STOCK_API_BASE=https://military-jobye-haiqstudios-14f59639.koyeb.app
```

### 6. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## 📁 Project Structure

```
K-Fin-Tracker/
├── index.html                      # Vite entry point
├── package.json
├── vite.config.ts
├── tsconfig.json
├── vercel.json                     # SPA routing config
├── .env.example                    # Environment variable template
│
├── src/
│   ├── main.tsx                    # React entry
│   ├── App.tsx                     # Routes + auth guard + login alerts
│   │
│   ├── types/
│   │   └── index.ts                # All TypeScript interfaces
│   │
│   ├── styles/
│   │   └── globals.css             # CSS variables — light & dark themes
│   │
│   ├── lib/
│   │   ├── ThemeContext.tsx         # Light/dark theme provider
│   │   ├── supabase.ts             # Supabase client + auth helpers
│   │   └── stockApi.ts             # NSE/BSE live price fetching + analytics
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx           # Google OAuth login screen
│   │   └── Dashboard.tsx           # Portfolio overview
│   │
│   └── components/
│       ├── layout/
│       │   └── Layout.tsx          # Sidebar + theme toggle + sign out
│       └── stocks/
│           ├── StockTracker.tsx    # Full stock tracker module
│           └── StockTracker.module.css
│
├── public/
│   ├── 404.html                    # SPA fallback
│   └── robots.txt                  # Block all crawlers
│
├── supabase/
│   └── schema.sql                  # Full DB schema with RLS policies
│
└── .github/
    └── workflows/
        └── deploy-kfin.yml         # GitHub Actions CI/CD pipeline
```

---

## 🔐 Security

| Feature | Status |
|---|---|
| Google OAuth only login | ✅ Active |
| Supabase Row Level Security | ✅ Active on all tables |
| Search engine blocked (robots.txt) | ✅ Active |
| Meta noindex tag | ✅ Active |
| GitHub repo private | ✅ Recommended |
| Unknown login push alerts (ntfy) | ✅ Active |
| GCP OAuth in Testing mode | ✅ Only your Gmail can log in |

---

## 📈 Stock Price API

Uses a **free Indian stock market API** — no API key required:

```
Base URL: https://military-jobye-haiqstudios-14f59639.koyeb.app
GET /stock?symbol=RELIANCE       → NSE live quote
GET /stock?symbol=RELIANCE.BO    → BSE live quote
GET /search?query=reliance       → company name search
```

- Backed by Yahoo Finance
- 60-second client-side cache to avoid rate limits
- Automatic mock data fallback during off-market hours (weekends, after 3:30 PM IST)
- Supports all NSE and BSE listed stocks

---

## 🚢 Deployment

### Automatic via GitHub Actions

Every push to `main` triggers:
1. `npm ci` — install dependencies
2. `npm run build` — Vite builds the app with env vars injected
3. Deploy to Vercel production

### Manual deploy
```bash
npm run build
# Upload dist/ to any static host
```

### Environment variables required in Vercel dashboard
| Key | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `VITE_STOCK_API_BASE` | Stock API base URL |

---

## 🗄️ Database Schema

All tables have **Row Level Security** enabled. Users can only access their own data.

| Table | Description |
|---|---|
| `profiles` | User profile (auto-created on signup) |
| `stock_holdings` | Stock portfolio holdings |
| `stock_transactions` | Buy/sell transaction history |
| `mutual_funds` | Mutual fund holdings |
| `gold_holdings` | Gold holdings (Physical, SGB, ETF) |
| `fixed_deposits` | FD and RD tracker |
| `expenses` | Monthly expense tracking |
| `income` | Income sources |

---

## 🤝 Contributing

This is a personal finance tracker — contributions are welcome for new modules.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/mutual-funds-tracker`
3. Commit your changes: `git commit -m 'feat: add mutual funds tracker'`
4. Push and open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👨‍💻 Author

**Karthik K** — [@KaRtHiK-56](https://github.com/KaRtHiK-56)

Built with ❤️ for the Indian investor community.

---

<div align="center">

**⭐ Star this repo if you find it useful!**

![Made in India](https://img.shields.io/badge/Made%20in-India%20🇮🇳-FF9933?style=for-the-badge)

</div>
