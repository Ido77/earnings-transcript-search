import React from 'react'
import { useParams } from 'react-router-dom'

export default function Transcript() {
  const { id } = useParams<{ id: string }>()
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transcript Details</h1>
        <p className="text-muted-foreground">
          Viewing transcript {id}
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-6 border rounded-lg">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">Company Name - Q1 2024</h2>
                <p className="text-muted-foreground">March 15, 2024</p>
              </div>
              
              <div className="flex gap-2">
                <button className="px-4 py-2 border rounded-lg">
                  Export
                </button>
                <button className="px-4 py-2 border rounded-lg">
                  Share
                </button>
              </div>
            </div>

            <div className="prose max-w-none">
              <p className="text-muted-foreground">
                Transcript content would be displayed here...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 