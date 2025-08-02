#!/bin/bash

echo "🔄 Restarting frontend on port 3000..."

# Kill any existing frontend process on port 3000
echo "📋 Checking for existing frontend processes..."
FRONTEND_PID=$(lsof -ti:3000)

if [ ! -z "$FRONTEND_PID" ]; then
    echo "🛑 Killing existing frontend process (PID: $FRONTEND_PID)..."
    kill -9 $FRONTEND_PID
    sleep 2
fi

# Verify port 3000 is free
if lsof -i :3000 > /dev/null 2>&1; then
    echo "❌ Port 3000 is still in use. Please check what's running on it."
    exit 1
fi

echo "✅ Port 3000 is free"

# Start frontend on port 3000
echo "🚀 Starting frontend on port 3000..."
cd frontend && npm run dev -- --port 3000 