import React from 'react'

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure application preferences and API settings
        </p>
      </div>

      <div className="space-y-6">
        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Theme</h3>
          <div className="space-y-3">
            <label className="flex items-center space-x-2">
              <input type="radio" name="theme" value="light" defaultChecked />
              <span>Light Mode</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="radio" name="theme" value="dark" />
              <span>Dark Mode</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="radio" name="theme" value="system" />
              <span>System Default</span>
            </label>
          </div>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Search Preferences</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Results per page</label>
              <select className="w-full p-2 mt-1 border rounded-lg">
                <option value="10">10</option>
                <option value="20" selected>20</option>
                <option value="50">50</option>
              </select>
            </div>
            
            <label className="flex items-center space-x-2">
              <input type="checkbox" defaultChecked />
              <span>Enable search highlighting</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input type="checkbox" defaultChecked />
              <span>Auto-save search history</span>
            </label>
          </div>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">API Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">API Ninjas Key</label>
              <input 
                type="password" 
                placeholder="Enter your API key..."
                className="w-full p-3 mt-1 border rounded-lg"
              />
            </div>
            
            <button className="px-6 py-2 bg-primary text-primary-foreground rounded-lg">
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 