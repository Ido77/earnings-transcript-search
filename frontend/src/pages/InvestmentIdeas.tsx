import React, { useState, useEffect } from 'react';
import { Bookmark, X, TrendingUp, Calendar, Building2 } from 'lucide-react';
import { toast } from '@/components/ui/toaster';

interface InvestmentIdea {
  id: string;
  ticker: string;
  companyName?: string;
  year: number;
  quarter: number;
  callDate?: string;
  synthesizedThesis: string;
  isBookmarked: boolean;
}

export default function InvestmentIdeas() {
  const [ideas, setIdeas] = useState<InvestmentIdea[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvestmentIdeas();
  }, []);

  const fetchInvestmentIdeas = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/investment-ideas?limit=50');
      const data = await response.json();
      
      if (data.success) {
        setIdeas(data.ideas);
      } else {
        toast('Failed to fetch investment ideas', 'error');
      }
    } catch (error) {
      console.error('Error fetching investment ideas:', error);
      toast('Error loading investment ideas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'bookmark' | 'pass') => {
    if (currentIndex >= ideas.length) return;
    
    const currentIdea = ideas[currentIndex];
    const isBookmark = action === 'bookmark';
    
    // Update bookmark status
    try {
      await fetch(`http://localhost:3001/api/investment-ideas/${currentIdea.id}/bookmark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bookmarked: isBookmark })
      });
      
      if (isBookmark) {
        toast(`💡 ${currentIdea.ticker} idea bookmarked!`, 'success');
      } else {
        toast(`👋 ${currentIdea.ticker} idea passed`, 'info');
      }
    } catch (error) {
      console.error('Error updating bookmark:', error);
    }
    
    // Move to next idea
    setCurrentIndex(prev => prev + 1);
  };



  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 text-lg">Loading investment ideas...</p>
        </div>
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-24 h-24 text-gray-400 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-4">No Investment Ideas Yet</h2>
          <p className="text-gray-600 dark:text-gray-400">Generate some AI summaries first to see investment ideas here!</p>
        </div>
      </div>
    );
  }

  if (currentIndex >= ideas.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-24 h-24 text-green-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-4">All Done! 🎉</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">You've reviewed all investment ideas.</p>
          <button
            onClick={() => setCurrentIndex(0)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  const currentIdea = ideas[currentIndex];
  const progress = ((currentIndex + 1) / ideas.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">💡 Investment Ideas</h1>
              <p className="text-gray-600 dark:text-gray-300 mt-1">Review investment theses and bookmark interesting opportunities</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {currentIndex + 1} of {ideas.length}
              </div>
              <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 py-8">
        <div className="max-w-4xl mx-auto px-6">
          {/* Company Header */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 mb-6">
            <div className="p-8">
              <div className="flex items-center gap-6">
                <div className="flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl text-white font-bold text-2xl shadow-lg">
                  {currentIdea.ticker}
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
                    {currentIdea.companyName || currentIdea.ticker}
                  </h2>
                  <div className="flex items-center gap-6 text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      <span className="font-medium">{currentIdea.year}Q{currentIdea.quarter}</span>
                    </div>
                    {currentIdea.callDate && (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        <span>{new Date(currentIdea.callDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Investment Thesis */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
                  Investment Thesis
                </h3>
              </div>
              
              <div className="prose prose-lg max-w-none">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg font-medium">
                  {currentIdea.synthesizedThesis}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-6">
            <button
              onClick={() => handleAction('pass')}
              className="flex items-center gap-3 px-8 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
            >
              <X className="w-6 h-6" />
              Pass
            </button>
            <button
              onClick={() => handleAction('bookmark')}
              className="flex items-center gap-3 px-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg"
            >
              <Bookmark className="w-6 h-6" />
              Bookmark Idea
            </button>
          </div>
          
          <div className="text-center mt-6">
            <p className="text-gray-500 dark:text-gray-400">
              Review this investment opportunity and decide if it's worth bookmarking
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}