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

-- Nyheter (fase 3)
CREATE TABLE IF NOT EXISTS news (
  id         TEXT PRIMARY KEY,
  title_key  TEXT,
  title      TEXT NOT NULL,
  url        TEXT,
  source     TEXT,
  published  TIMESTAMPTZ,
  excerpt    TEXT,
  summary    TEXT,
  category   TEXT,
  companies  TEXT[],
  feed       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_published_idx ON news (published DESC);

-- Antall stoppede analytikeranbefalinger per dag
CREATE TABLE IF NOT EXISTS news_blocked (
  day DATE PRIMARY KEY,
  n   INT NOT NULL DEFAULT 0
);

-- Fase 4
ALTER TABLE news ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS body_status TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS final_url TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS fetch_tries INT NOT NULL DEFAULT 0;
ALTER TABLE lice_week ADD COLUMN IF NOT EXISTS avg_w REAL;
CREATE TABLE IF NOT EXISTS lice_company (year INT NOT NULL, week INT NOT NULL, symbol TEXT NOT NULL, localities INT, reported INT, avg_lice REAL, avg_w REAL, over_limit INT, ila INT, pd INT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (year, week, symbol));
CREATE TABLE IF NOT EXISTS announcements (id BIGINT PRIMARY KEY, symbol TEXT NOT NULL, title TEXT NOT NULL, category TEXT, kind TEXT, published TIMESTAMPTZ, body TEXT, attachments INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS announcements_sym_idx ON announcements (symbol, published DESC);
CREATE TABLE IF NOT EXISTS fundamentals (symbol TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS note_folders (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, folder_id INT REFERENCES note_folders(id) ON DELETE SET NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', symbol TEXT, pinned BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- Shipping
CREATE TABLE IF NOT EXISTS freight (series TEXT NOT NULL, day DATE NOT NULL, value DOUBLE PRECISION NOT NULL, unit TEXT, source TEXT, note TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (series, day));
CREATE TABLE IF NOT EXISTS chokepoints (day DATE NOT NULL, portid TEXT NOT NULL, name TEXT, n_total INT, n_tanker INT, n_container INT, n_dry_bulk INT, n_cargo INT, n_roro INT, capacity DOUBLE PRECISION, cap_tanker DOUBLE PRECISION, cap_container DOUBLE PRECISION, cap_dry_bulk DOUBLE PRECISION, PRIMARY KEY (day, portid));
CREATE TABLE IF NOT EXISTS ais_ships (mmsi BIGINT PRIMARY KEY, name TEXT, ship_type INT, dest TEXT, draught REAL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ais_positions (mmsi BIGINT PRIMARY KEY, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, sog REAL, zone TEXT, kind TEXT, seen TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS ais_zone (ts TIMESTAMPTZ NOT NULL, zone TEXT NOT NULL, total INT, tankers INT, cargo INT, PRIMARY KEY (ts, zone));
CREATE TABLE IF NOT EXISTS alerts (key TEXT PRIMARY KEY, kind TEXT, symbol TEXT, title TEXT NOT NULL, body TEXT, url TEXT, level INT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS alerts_created_idx ON alerts (created_at DESC);
CREATE TABLE IF NOT EXISTS briefs (day DATE PRIMARY KEY, text TEXT NOT NULL DEFAULT '', model TEXT, snapshot TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS currency TEXT;
-- KI-rapportleser: én rad per selskap og kvartal
CREATE TABLE IF NOT EXISTS reports (key TEXT PRIMARY KEY, symbol TEXT NOT NULL, period TEXT NOT NULL, published TIMESTAMPTZ, title TEXT,
  message_ids BIGINT[] NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending', tries INT NOT NULL DEFAULT 0, data JSONB, model TEXT,
  source_chars INT, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS reports_sym_idx ON reports (symbol, published DESC);
-- Kilder fra laksterminalen som ikke lenger hentes
DELETE FROM source_status WHERE source IN ('SSB laksepris', 'Fiskeridirektoratet (biomasse)', 'BarentsWatch (lus og sykdom)', 'Euronext (terminkurve)', 'IMF/FRED (fôrråvarer)', 'Yahoo Finance (kurser)', 'Yahoo Finance (konsensus og nøkkeltall)');
-- Engangsopprydding etter overgangen fra laks til shipping (trygt å kjøre flere ganger)
DELETE FROM quotes WHERE symbol IN ('MOWI.OL', 'SALM.OL', 'BAKKA.OL', 'LSG.OL', 'GSF.OL');
DELETE FROM price_intraday WHERE symbol IN ('MOWI.OL', 'SALM.OL', 'BAKKA.OL', 'LSG.OL', 'GSF.OL', 'EURNOK=X');
DELETE FROM fundamentals WHERE symbol IN ('MOWI.OL', 'SALM.OL', 'BAKKA.OL', 'LSG.OL', 'GSF.OL');
DELETE FROM announcements WHERE symbol IN ('MOWI.OL', 'SALM.OL', 'BAKKA.OL', 'LSG.OL', 'GSF.OL');
DELETE FROM shorts WHERE symbol IN ('MOWI.OL', 'SALM.OL', 'BAKKA.OL', 'LSG.OL', 'GSF.OL');
DELETE FROM news WHERE created_at < '2026-11-22T10:24:00Z';

-- Global AIS: mer skipsdata, kurs, størrelse og lastet/ballast, stillestående skip per område
ALTER TABLE ais_ships ADD COLUMN IF NOT EXISTS length REAL;
ALTER TABLE ais_ships ADD COLUMN IF NOT EXISTS imo BIGINT;
ALTER TABLE ais_positions ADD COLUMN IF NOT EXISTS cog REAL;
ALTER TABLE ais_positions ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE ais_positions ADD COLUMN IF NOT EXISTS laden BOOLEAN;
ALTER TABLE ais_positions ADD COLUMN IF NOT EXISTS dest TEXT;
ALTER TABLE ais_zone ADD COLUMN IF NOT EXISTS still INT;
ALTER TABLE ais_zone ADD COLUMN IF NOT EXISTS still_tank INT;
ALTER TABLE ais_zone ADD COLUMN IF NOT EXISTS still_last INT;
CREATE INDEX IF NOT EXISTS ais_positions_seen_idx ON ais_positions (seen DESC);

-- Bunkerpriser per havn (USD/tonn)
CREATE TABLE IF NOT EXISTS bunkers (day DATE NOT NULL, port TEXT NOT NULL, grade TEXT NOT NULL, price REAL, change REAL, source TEXT,
  PRIMARY KEY (day, port, grade));

-- Havneaktivitet fra IMF PortWatch (anløp per skipstype og anslått import/eksport i tonn)
CREATE TABLE IF NOT EXISTS port_activity (day DATE NOT NULL, portid TEXT NOT NULL, portname TEXT, country TEXT,
  calls INT, calls_tanker INT, calls_dry_bulk INT, calls_container INT, import REAL, export REAL,
  import_tanker REAL, export_tanker REAL, import_dry_bulk REAL, export_dry_bulk REAL, PRIMARY KEY (day, portid));

-- Vær: tropiske stormer (GDACS) og Panamakanalen
CREATE TABLE IF NOT EXISTS weather_events (id TEXT PRIMARY KEY, name TEXT, alert TEXT, country TEXT, lat REAL, lon REAL,
  from_date TIMESTAMPTZ, to_date TIMESTAMPTZ, near TEXT, near_km REAL, url TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS panama (day DATE PRIMARY KEY, gatun_ft REAL, draft_neo_ft REAL, draft_panamax_ft REAL, surcharge_pct REAL);

-- Meglerrapporter lest av KI
CREATE TABLE IF NOT EXISTS broker_reports (url TEXT PRIMARY KEY, title TEXT, broker TEXT, published TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'pending',
  tries INT NOT NULL DEFAULT 0, data JSONB, model TEXT, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS broker_reports_pub_idx ON broker_reports (published DESC);

-- Dine egne justeringer i bookingtabellen (lages også av nettsiden)
CREATE TABLE IF NOT EXISTS booking_inputs (symbol TEXT NOT NULL, segment TEXT NOT NULL, vessels REAL, rest_rate REAL, breakeven REAL, util REAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (symbol, segment));

-- Kunnskapsbanken: kilder i kø og notatene den lokale KI-modellen har skrevet (søkbare med fulltekstsøk)
CREATE TABLE IF NOT EXISTS kb_sources (url TEXT PRIMARY KEY, kind TEXT, title TEXT, topic TEXT, priority INT NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending', tries INT NOT NULL DEFAULT 0, chars INT, error TEXT,
  added TIMESTAMPTZ NOT NULL DEFAULT now(), done_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS knowledge (id SERIAL PRIMARY KEY, url TEXT NOT NULL, kind TEXT NOT NULL, topic TEXT, title TEXT NOT NULL,
  body TEXT NOT NULL, facts JSONB, symbols TEXT[] NOT NULL DEFAULT '{}', source_title TEXT, model TEXT, checked INT, unverified INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('norwegian'::regconfig, coalesce(title, '') || ' ' || coalesce(topic, '') || ' ' || body)) STORED);
CREATE INDEX IF NOT EXISTS knowledge_tsv_idx ON knowledge USING gin (tsv);
CREATE INDEX IF NOT EXISTS knowledge_url_idx ON knowledge (url);
