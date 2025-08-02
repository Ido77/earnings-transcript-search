#!/bin/bash

echo "🔄 Restarting both frontend and backend servers..."

# Kill any existing processes on ports 3000 and 3001
echo "📋 Checking for existing processes..."

# Kill frontend (port 3000)
FRONTEND_PID=$(lsof -ti:3000)
if [ ! -z "$FRONTEND_PID" ]; then
    echo "🛑 Killing existing frontend process (PID: $FRONTEND_PID)..."
    kill -9 $FRONTEND_PID
fi

# Kill backend (port 3001)
BACKEND_PID=$(lsof -ti:3001)
if [ ! -z "$BACKEND_PID" ]; then
    echo "🛑 Killing existing backend process (PID: $BACKEND_PID)..."
    kill -9 $BACKEND_PID
fi

sleep 2

# Verify ports are free
if lsof -i :3000 > /dev/null 2>&1; then
    echo "❌ Port 3000 is still in use."
    exit 1
fi

if lsof -i :3001 > /dev/null 2>&1; then
    echo "❌ Port 3001 is still in use."
    exit 1
fi

echo "✅ Ports 3000 and 3001 are free"

# Start backend first
echo "🚀 Starting backend on port 3001..."
cd backend && npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend
echo "🚀 Starting frontend on port 3000..."
cd ../frontend && npm run dev -- --port 3000 &
FRONTEND_PID=$!

echo "✅ Both servers started!"
echo "📊 Frontend: http://localhost:3000 (PID: $FRONTEND_PID)"
echo "📊 Backend: http://localhost:3001 (PID: $BACKEND_PID)"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user to stop
wait 