# Earnings Call Transcript Search System

A fast, modern web application to fetch, store, and search earnings call transcripts from multiple companies using the API Ninjas Earnings Call Transcript API.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- API Ninjas API Key ([Get one here](https://api.api-ninjas.com/))

### Setup
1. **Clone and setup environment**:
```bash
# Clone the repository
git clone <your-repo-url>
cd tran_analysis

# Copy environment file
cp .env.example .env
# Edit .env and add your API_NINJAS_KEY
```

2. **Start the development environment**:
```bash
# Start all services (database, backend, frontend)
docker-compose up -d

# Or run individually:
npm run dev:backend  # Backend on http://localhost:3001
npm run dev:frontend # Frontend on http://localhost:3000

# Or use the convenient restart scripts:
./restart-servers.sh     # Restart both frontend and backend
./restart-frontend.sh    # Restart frontend only
./check-status.sh        # Check server status
```

3. **Initialize the database**:
```bash
npm run db:migrate
```

## 🏗️ Architecture

### Tech Stack
- **Database**: PostgreSQL with Full-Text Search
- **Backend**: Node.js + Express + Prisma ORM
- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Development**: Docker Compose for local development

### Project Structure
```
tran_analysis/
├── backend/          # Express.js API server
├── frontend/         # React + Vite application  
├── database/         # Database schemas and migrations
├── docker-compose.yml
└── package.json      # Root package for scripts
```

## 📋 Features

### ✅ Implemented
- [x] Ticker management and bulk fetching
- [x] PostgreSQL database with full-text search
- [x] Modern React UI with Tailwind CSS
- [x] Real-time search with debouncing
- [x] Advanced filtering and regex support
- [x] AI-powered transcript summarization with Ollama
- [x] Copy to clipboard functionality
- [x] Dark/light mode toggle

### 🔄 In Progress
- Setting up core infrastructure...

## 🛠️ Development

### Available Scripts
```bash
npm run dev:backend   # Start backend development server
npm run dev:frontend  # Start frontend development server
npm run dev:all       # Start both backend and frontend
npm run db:migrate    # Run database migrations
npm run db:reset      # Reset database
npm run build         # Build for production
```

### API Endpoints
- `POST /api/tickers/bulk-fetch` - Fetch transcripts for ticker list
- `GET /api/transcripts/search` - Search with keywords/regex
- `GET /api/transcripts/:ticker` - Get all transcripts for ticker
- `POST /api/transcripts/refresh` - Refresh specific transcripts
- `POST /api/transcripts/:id/summarize` - Generate AI summary of transcript
- `GET /api/ollama/health` - Check Ollama service status
- `GET /api/stats` - System statistics

### AI Summarization with Ollama
The system includes AI-powered transcript summarization using Ollama (local LLM):

1. **Install Ollama**: Download from [ollama.ai](https://ollama.ai)
2. **Pull a model**: `ollama pull deepseek-r1:latest`
3. **Start Ollama**: `ollama serve`
4. **Use in UI**: Click the 🤖 button next to search results to generate summaries

The AI summaries focus on:
- Key financial metrics and performance highlights
- Strategic initiatives and business updates
- Management's outlook and guidance
- **🎯 SURPRISES & POSITIVE OUTLIERS** (most important section)
  - Unexpected positive results or outperformance
  - Surprising strategic moves or partnerships
  - Outlier metrics that beat expectations
  - Positive surprises in guidance or outlook
  - Unexpected market opportunities or tailwinds
- Risk factors or challenges mentioned

#### Features
- **🧠 AI Analysis Process**: Collapsible section showing the AI's reasoning
- **🎯 Positive Outliers**: Highlighted section for unexpected positive developments
- **Structured Output**: Clean, organized summary with bullet points
- **Search Context**: Summaries are generated with your search query in mind
- **💾 Persistent Cache**: Summaries are automatically cached and persist across sessions
- **Cache Indicators**: 
  - 🤖💾 Green button = Cached summary available
  - 🤖 Blue button = Generate new summary
  - 💾 Cached badge in summary header

#### Cache Management
- **Automatic Caching**: Summaries are cached by transcript ID and search query
- **Cache Location**: `backend/cache/summaries.json`
- **Cache Endpoints**:
  - `GET /api/transcripts/:id/summaries` - Get all cached summaries for a transcript
  - `DELETE /api/summaries/cache?transcriptId=id` - Clear cache for specific transcript
  - `DELETE /api/summaries/cache` - Clear all cached summaries

## 📊 Expected Performance
- **Search Response**: <500ms for keyword searches
- **Page Load**: <2s initial load
- **UI Responsiveness**: <100ms for user interactions

## 🔍 Example Use Cases
1. **AI Investment Research**: Search for "artificial intelligence" OR "machine learning"
2. **Market Sentiment**: Regex search for uncertainty patterns
3. **Competitive Analysis**: Compare companies discussing the same topic
4. **Executive Tracking**: Find statements by specific executives
5. **Risk Assessment**: Search for regulatory/economic risk mentions 