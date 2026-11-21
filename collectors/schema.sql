-- FUGLESANG: databaseskjema. Kjøres automatisk av innsamlerne (trygt å kjøre flere ganger).

-- Siste kurs per aksje/valuta (oppdateres hvert 15. minutt i børstiden)
CREATE TABLE IF NOT EXISTS quotes (
  symbol      TEXT PRIMARY KEY,          -- f.eks. MOWI.OL, EURNOK=X
  name        TEXT NOT NULL,
  price       NUMERIC,
  prev_close  NUMERIC,
  change_pct  NUMERIC,
  volume      BIGINT,
  currency    TEXT,
  market_time TIMESTAMPTZ,               -- tidspunktet kursen gjelder
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sluttkurs per dag (historikk til grafer)
CREATE TABLE IF NOT EXISTS price_daily (
  symbol TEXT NOT NULL,
  day    DATE NOT NULL,
  close  NUMERIC,
  volume BIGINT,
  PRIMARY KEY (symbol, day)
);

-- Kurser per 15 minutter (siste ca. 10 dager, til 1D/1U-grafer)
CREATE TABLE IF NOT EXISTS price_intraday (
  symbol TEXT NOT NULL,
  ts     TIMESTAMPTZ NOT NULL,
  price  NUMERIC,
  PRIMARY KEY (symbol, ts)
);

-- SSB tabell 03024: eksportpris og mengde for oppdrettslaks per uke
CREATE TABLE IF NOT EXISTS ssb_salmon (
  period        TEXT PRIMARY KEY,         -- f.eks. 2026U47
  year          INT NOT NULL,
  week          INT NOT NULL,
  fresh_price   NUMERIC,                  -- kr/kg, fersk eller kjølt
  fresh_tonnes  NUMERIC,
  frozen_price  NUMERIC,
  frozen_tonnes NUMERIC,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status for hver datakilde (vises under Systemstatus)
CREATE TABLE IF NOT EXISTS source_status (
  source    TEXT PRIMARY KEY,
  last_run  TIMESTAMPTZ,
  last_ok   TIMESTAMPTZ,
  ok        BOOLEAN,
  rows      INT,
  message   TEXT
);

-- Sperre for innlogging (én rad)
CREATE TABLE IF NOT EXISTS login_guard (
  id           INT PRIMARY KEY DEFAULT 1,
  fails        INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);
INSERT INTO login_guard (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ===== Fase 2 =====

-- Shortposisjoner fra Finanstilsynet (sum av offentlige posisjoner per dag)
CREATE TABLE IF NOT EXISTS shorts (
  symbol  TEXT NOT NULL,
  day     DATE NOT NULL,
  pct     NUMERIC,
  holders INT,
  PRIMARY KEY (symbol, day)
);

-- Fôrråvarer fra IMF (via FRED), USD per tonn, månedlig
CREATE TABLE IF NOT EXISTS feed_raw (
  series TEXT NOT NULL,
  month  DATE NOT NULL,
  usd    NUMERIC,
  PRIMARY KEY (series, month)
);

-- Ferdig beregnet fôrråvareindeks (januar 2026 = 100)
CREATE TABLE IF NOT EXISTS feed_index (
  month     DATE PRIMARY KEY,
  index_usd NUMERIC,
  index_nok NUMERIC
);

-- Biomasse av laks per produksjonsområde, ved utgangen av hver måned
CREATE TABLE IF NOT EXISTS biomass (
  month   DATE NOT NULL,
  po      INT NOT NULL,
  name    TEXT,
  count_k NUMERIC,
  tonnes  NUMERIC,
  PRIMARY KEY (month, po)
);

-- Terminpriser for laks (Euronext Salmon Futures), EUR per tonn
CREATE TABLE IF NOT EXISTS futures (
  snapshot DATE NOT NULL,
  contract DATE NOT NULL,
  settle   NUMERIC,
  open_int INT,
  PRIMARY KEY (snapshot, contract)
);

-- Lus og sykdom per uke, hele landet (BarentsWatch)
CREATE TABLE IF NOT EXISTS lice_week (
  year        INT NOT NULL,
  week        INT NOT NULL,
  avg_lice    NUMERIC,
  reported    INT,
  over_limit  INT,
  ila         INT,
  pd          INT,
  localities  INT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (year, week)
);
