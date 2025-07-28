import React from 'react'

export function Toaster() {
  return (
    <div
      id="toast-container"
      className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2"
    />
  )
}

export function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const toastContainer = document.getElementById('toast-container')
  if (!toastContainer) return

  const toastElement = document.createElement('div')
  toastElement.className = `
    px-4 py-3 rounded-lg shadow-lg max-w-sm
    animate-fade-in
    ${type === 'success' ? 'bg-green-600 text-white' : ''}
    ${type === 'error' ? 'bg-red-600 text-white' : ''}
    ${type === 'info' ? 'bg-blue-600 text-white' : ''}
  `
  toastElement.textContent = message

  toastContainer.appendChild(toastElement)

  // Remove after 3 seconds
  setTimeout(() => {
    toastElement.style.opacity = '0'
    toastElement.style.transform = 'translateX(100%)'
    setTimeout(() => {
      if (toastContainer.contains(toastElement)) {
        toastContainer.removeChild(toastElement)
      }
    }, 300)
  }, 3000)
} 