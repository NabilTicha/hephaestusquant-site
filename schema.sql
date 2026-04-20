-- Hephaestus Quant Forecasting Platform Schema

DROP TABLE IF EXISTS forecast_grids;
DROP TABLE IF EXISTS forecasts;
DROP TABLE IF EXISTS price_snapshots;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  picture_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('equity', 'index', 'crypto', 'commodity', 'fx', 'sector_etf', 'international')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE price_snapshots (
  asset_id TEXT NOT NULL REFERENCES assets(id),
  date TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (asset_id, date)
);

CREATE TABLE forecasts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  reference_price REAL NOT NULL,
  horizon_days INTEGER,
  -- Placeholder score. Will be replaced by a real distributional score
  -- (CRPS / log-loss over the grid) once scoring v2 lands.
  score REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2D PDF grid painted by the user. grid is N_T * N_P bytes, row-major,
-- where each row is one time column (t from 0..N_T-1) and each column is
-- a price bin (p from 0..N_P-1, low to high). Values are uint8 where
-- 255 = per-column max; the grid is thus already per-column max-normalised.
CREATE TABLE forecast_grids (
  forecast_id TEXT PRIMARY KEY REFERENCES forecasts(id) ON DELETE CASCADE,
  n_t INTEGER NOT NULL,
  n_p INTEGER NOT NULL,
  price_min REAL NOT NULL,
  price_max REAL NOT NULL,
  grid BLOB NOT NULL,
  compression TEXT NOT NULL DEFAULT 'none',
  justification TEXT
);

CREATE INDEX idx_forecasts_user ON forecasts(user_id);
CREATE INDEX idx_forecasts_asset ON forecasts(asset_id);
CREATE INDEX idx_forecasts_score ON forecasts(score);
CREATE INDEX idx_price_snapshots_date ON price_snapshots(date);

-- Seed: US Equities
INSERT INTO assets (id, name, asset_class) VALUES
  ('AAPL', 'Apple Inc.', 'equity'),
  ('MSFT', 'Microsoft Corp.', 'equity'),
  ('GOOGL', 'Alphabet Inc.', 'equity'),
  ('AMZN', 'Amazon.com Inc.', 'equity'),
  ('NVDA', 'NVIDIA Corp.', 'equity'),
  ('TSLA', 'Tesla Inc.', 'equity'),
  ('META', 'Meta Platforms Inc.', 'equity'),
  ('JPM', 'JPMorgan Chase & Co.', 'equity'),
  ('V', 'Visa Inc.', 'equity'),
  ('JNJ', 'Johnson & Johnson', 'equity'),
  ('WMT', 'Walmart Inc.', 'equity'),
  ('PG', 'Procter & Gamble Co.', 'equity'),
  ('MA', 'Mastercard Inc.', 'equity'),
  ('UNH', 'UnitedHealth Group', 'equity'),
  ('HD', 'Home Depot Inc.', 'equity'),
  ('DIS', 'Walt Disney Co.', 'equity'),
  ('BAC', 'Bank of America Corp.', 'equity'),
  ('XOM', 'Exxon Mobil Corp.', 'equity'),
  ('PFE', 'Pfizer Inc.', 'equity'),
  ('KO', 'Coca-Cola Co.', 'equity'),
  ('NFLX', 'Netflix Inc.', 'equity'),
  ('AMD', 'Advanced Micro Devices', 'equity'),
  ('INTC', 'Intel Corp.', 'equity'),
  ('CRM', 'Salesforce Inc.', 'equity'),
  ('COST', 'Costco Wholesale', 'equity');

-- Seed: Indices
INSERT INTO assets (id, name, asset_class) VALUES
  ('SPY', 'S&P 500 ETF', 'index'),
  ('QQQ', 'Nasdaq 100 ETF', 'index'),
  ('DIA', 'Dow Jones ETF', 'index'),
  ('IWM', 'Russell 2000 ETF', 'index'),
  ('^VIX', 'CBOE Volatility Index', 'index');

-- Seed: Crypto
INSERT INTO assets (id, name, asset_class) VALUES
  ('BTC-USD', 'Bitcoin', 'crypto'),
  ('ETH-USD', 'Ethereum', 'crypto'),
  ('SOL-USD', 'Solana', 'crypto'),
  ('BNB-USD', 'BNB', 'crypto'),
  ('ADA-USD', 'Cardano', 'crypto');

-- Seed: Commodities
INSERT INTO assets (id, name, asset_class) VALUES
  ('GC=F', 'Gold Futures', 'commodity'),
  ('CL=F', 'Crude Oil Futures', 'commodity'),
  ('SI=F', 'Silver Futures', 'commodity'),
  ('NG=F', 'Natural Gas Futures', 'commodity'),
  ('HG=F', 'Copper Futures', 'commodity');

-- Seed: FX
INSERT INTO assets (id, name, asset_class) VALUES
  ('EURUSD=X', 'EUR/USD', 'fx'),
  ('GBPUSD=X', 'GBP/USD', 'fx'),
  ('USDJPY=X', 'USD/JPY', 'fx'),
  ('AUDUSD=X', 'AUD/USD', 'fx'),
  ('USDCHF=X', 'USD/CHF', 'fx');

-- Seed: Sector ETFs
INSERT INTO assets (id, name, asset_class) VALUES
  ('XLF', 'Financial Select Sector', 'sector_etf'),
  ('XLE', 'Energy Select Sector', 'sector_etf'),
  ('XLK', 'Technology Select Sector', 'sector_etf'),
  ('XLV', 'Health Care Select Sector', 'sector_etf'),
  ('XLI', 'Industrial Select Sector', 'sector_etf'),
  ('XLP', 'Consumer Staples Select', 'sector_etf'),
  ('XLY', 'Consumer Discretionary Select', 'sector_etf'),
  ('XLU', 'Utilities Select Sector', 'sector_etf'),
  ('XLRE', 'Real Estate Select Sector', 'sector_etf'),
  ('XLB', 'Materials Select Sector', 'sector_etf');

-- Seed: International
INSERT INTO assets (id, name, asset_class) VALUES
  ('EWJ', 'iShares MSCI Japan', 'international'),
  ('FXI', 'iShares China Large-Cap', 'international'),
  ('EFA', 'iShares MSCI EAFE', 'international'),
  ('EEM', 'iShares MSCI Emerging Markets', 'international'),
  ('EWZ', 'iShares MSCI Brazil', 'international');
