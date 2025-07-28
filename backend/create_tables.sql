-- Create the transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker VARCHAR(10) NOT NULL,
    company_name VARCHAR(255),
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL,
    call_date DATE,
    full_transcript TEXT NOT NULL,
    transcript_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(ticker, year, quarter)
);

-- Create the companies table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    is_active BOOLEAN DEFAULT true,
    last_fetched TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create the search_logs table
CREATE TABLE IF NOT EXISTS search_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    filters JSONB,
    result_count INTEGER NOT NULL,
    execution_time INTEGER NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create the fetch_jobs table
CREATE TABLE IF NOT EXISTS fetch_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(ticker, year, quarter)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transcripts_ticker ON transcripts(ticker);
CREATE INDEX IF NOT EXISTS idx_transcripts_year_quarter ON transcripts(year, quarter);
CREATE INDEX IF NOT EXISTS idx_transcripts_call_date ON transcripts(call_date);
CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_fetch_jobs_status ON fetch_jobs(status);

-- Create full-text search index
CREATE INDEX IF NOT EXISTS idx_transcripts_fts ON transcripts USING GIN(to_tsvector('english', full_transcript));

-- Grant permissions to dev user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dev;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dev; 