import { Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme/theme-provider'
import Layout from '@/components/layout/Layout'
import Home from '@/pages/Home'
import Search from '@/pages/Search'
import Tickers from '@/pages/Tickers'
import Transcript from '@/pages/Transcript'
import Analytics from '@/pages/Analytics'
import Settings from '@/pages/Settings'
import BulkAI from '@/pages/BulkAI'
import InvestmentIdeas from '@/pages/InvestmentIdeas'
import BookmarkedIdeas from '@/pages/BookmarkedIdeas'

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="transcript-search-theme">
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/tickers" element={<Tickers />} />
          <Route path="/transcript/:id" element={<Transcript />} />
          <Route path="/investment-ideas" element={<InvestmentIdeas />} />
          <Route path="/bookmarked-ideas" element={<BookmarkedIdeas />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/bulk-ai" element={<BulkAI />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      <Toaster />
    </ThemeProvider>
  )
}

export default App 