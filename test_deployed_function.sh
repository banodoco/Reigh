#!/bin/bash

# Test deployed claim-next-task function
URL="https://wczysqzxlwdndgxitrvc.supabase.co/functions/v1/claim-next-task"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjenlzc3p4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU"

echo "🧪 Testing Deployed claim-next-task Function"
echo "============================================"

echo ""
echo "1. Testing service role normal claim..."
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{}' | python3 -m json.tool 2>/dev/null || echo "Response (not JSON): $(curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Authorization: Bearer $SERVICE_KEY" -d '{}')"

echo ""
echo "2. Testing service role dry-run..."
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{"dry_run": true}' | python3 -m json.tool 2>/dev/null || echo "Response (not JSON): $(curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Authorization: Bearer $SERVICE_KEY" -d '{"dry_run": true}')"

echo ""
echo "3. Testing with worker_id..."
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{"worker_id": "test_worker_123"}' | python3 -m json.tool 2>/dev/null || echo "Response (not JSON): $(curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Authorization: Bearer $SERVICE_KEY" -d '{"worker_id": "test_worker_123"}')"

echo ""
echo "✅ Tests completed!" 