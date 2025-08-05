import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, BarChart3, Settings, FileText, Home, Moon, Sun, Brain } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { theme, setTheme } = useTheme()

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Search', href: '/search', icon: Search },
    { name: 'Tickers', href: '/tickers', icon: FileText },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Bulk AI', href: '/bulk-ai', icon: Brain },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center space-x-2">
                <FileText className="h-6 w-6" />
                <span className="font-bold text-lg">Transcript Search</span>
              </Link>

              <div className="hidden md:flex items-center space-x-6">
                {navigation.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.href
                  
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                {theme === 'light' ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <div className="md:hidden border-b bg-background">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto py-2 space-x-4">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-sm text-muted-foreground">
              © 2024 Earnings Call Transcript Search. Built with React, Express, and PostgreSQL.
            </div>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>System Status: Healthy</span>
              <span>•</span>
              <span>API: Connected</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
} 