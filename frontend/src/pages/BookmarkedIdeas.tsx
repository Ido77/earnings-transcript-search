import React, { useState, useEffect } from 'react';
import { Bookmark, Calendar, Building2, ExternalLink, Trash2, TrendingUp } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { Link } from 'react-router-dom';

interface BookmarkedIdea {
  id: string;
  ticker: string;
  companyName?: string;
  year: number;
  quarter: number;
  quarterDate?: string;
  thesis: string;
  transcriptId: string;
  bookmarkedAt: string;
}

export default function BookmarkedIdeas() {
  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<BookmarkedIdea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookmarkedIdeas();
  }, []);

  const fetchBookmarkedIdeas = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/bookmarked-ideas');
      const data = await response.json();
      
      if (data.success) {
        setBookmarkedIdeas(data.bookmarkedIdeas);
      } else {
        toast('Failed to fetch bookmarked ideas', 'error');
      }
    } catch (error) {
      console.error('Error fetching bookmarked ideas:', error);
      toast('Error loading bookmarked ideas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBookmark = async (idea: BookmarkedIdea) => {
    try {
      const response = await fetch(`http://localhost:3001/api/investment-ideas/${idea.transcriptId}/bookmark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bookmarked: false })
      });

      if (response.ok) {
        // Remove from local state
        setBookmarkedIdeas(prev => prev.filter(b => b.id !== idea.id));
        toast(`📝 ${idea.ticker} removed from bookmarks`, 'success');
      } else {
        toast('Failed to remove bookmark', 'error');
      }
    } catch (error) {
      console.error('Error removing bookmark:', error);
      toast('Error removing bookmark', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 text-lg">Loading bookmarked ideas...</p>
        </div>
      </div>
    );
  }

  if (bookmarkedIdeas.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 rounded-t-2xl">
            <div className="px-8 py-6">
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">🔖 Bookmarked Ideas</h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2">Your saved investment opportunities</p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-b-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Bookmark className="w-24 h-24 text-gray-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-4">No Bookmarked Ideas Yet</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Start exploring investment ideas and bookmark the ones that interest you!</p>
            <Link 
              to="/investment-ideas"
              className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-medium transition-colors"
            >
              <TrendingUp className="w-5 h-5" />
              Explore Investment Ideas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">🔖 Bookmarked Ideas</h1>
              <p className="text-gray-600 dark:text-gray-300 mt-1">Your saved investment opportunities</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {bookmarkedIdeas.length} {bookmarkedIdeas.length === 1 ? 'Idea' : 'Ideas'}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Saved for review</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bookmarked Ideas Grid */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {bookmarkedIdeas.map((idea) => (
            <div key={idea.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-shadow">
              {/* Card Header */}
              <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl text-white font-bold text-lg">
                      {idea.ticker}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-white">
                        {idea.companyName || idea.ticker}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {idea.year}Q{idea.quarter}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleRemoveBookmark(idea)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    title="Remove bookmark"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Bookmarked {new Date(idea.bookmarkedAt).toLocaleDateString()}
                </div>
              </div>

              {/* Thesis Preview */}
              <div className="p-6">
                <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide">
                  Investment Thesis
                </h4>
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed line-clamp-4">
                  {idea.thesis.length > 200 ? `${idea.thesis.substring(0, 200)}...` : idea.thesis}
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6">
                <Link
                  to={`/transcript/${idea.transcriptId}`}
                  className="inline-flex items-center gap-2 w-full justify-center bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-4 py-3 rounded-xl font-medium transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Full Transcript
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}