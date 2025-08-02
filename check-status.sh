#!/bin/bash

echo "📊 Server Status Check"
echo "======================"

# Check frontend (port 3000)
FRONTEND_PID=$(lsof -ti:3000)
if [ ! -z "$FRONTEND_PID" ]; then
    echo "✅ Frontend: Running on port 3000 (PID: $FRONTEND_PID)"
    echo "   URL: http://localhost:3000"
else
    echo "❌ Frontend: Not running on port 3000"
fi

echo ""

# Check backend (port 3001)
BACKEND_PID=$(lsof -ti:3001)
if [ ! -z "$BACKEND_PID" ]; then
    echo "✅ Backend: Running on port 3001 (PID: $BACKEND_PID)"
    echo "   URL: http://localhost:3001"
    
    # Test backend API
    if curl -s http://localhost:3001/api/test > /dev/null 2>&1; then
        echo "   Status: API responding ✅"
    else
        echo "   Status: API not responding ❌"
    fi
else
    echo "❌ Backend: Not running on port 3001"
fi

echo ""
echo "🔧 Quick Commands:"
echo "   ./restart-frontend.sh    - Restart frontend only"
echo "   ./restart-servers.sh     - Restart both servers"
echo "   ./check-status.sh        - Check status (this script)" 