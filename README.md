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
- [ ] Ticker management and bulk fetching
- [ ] PostgreSQL database with full-text search
- [ ] Modern React UI with Tailwind CSS
- [ ] Real-time search with debouncing
- [ ] Advanced filtering and regex support
- [ ] Export functionality
- [ ] Dark/light mode toggle

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
- `GET /api/stats` - System statistics

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