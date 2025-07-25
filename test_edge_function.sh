#!/bin/bash

# Test script for claim_next_task edge function
# Usage: ./test_edge_function.sh

# Configuration
SUPABASE_URL="YOUR_SUPABASE_URL"
USER_TOKEN="YOUR_USER_API_TOKEN"
SERVICE_KEY="YOUR_SERVICE_ROLE_KEY"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing claim_next_task Edge Function${NC}"
echo "========================================"

# Test 1: User token claiming
echo -e "\n${YELLOW}Test 1: User Token Claim${NC}"
echo "-------------------------"
echo "Testing with user token to see if concurrency limit is enforced..."

response=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/claim_next_task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -d '{}')

echo "Response: $response"

if echo "$response" | grep -q "at limit"; then
  echo -e "${GREEN}✅ Concurrency limit is working - user is at limit${NC}"
elif echo "$response" | grep -q "task_id"; then
  echo -e "${GREEN}✅ Task claimed successfully - user has capacity${NC}"
elif echo "$response" | grep -q "No queued tasks"; then
  echo -e "${YELLOW}⚠️  No tasks available to claim${NC}"
else
  echo -e "${RED}❌ Unexpected response${NC}"
fi

# Test 2: Multiple rapid claims (to test concurrency)
echo -e "\n${YELLOW}Test 2: Rapid Multiple Claims${NC}"
echo "-------------------------------"
echo "Making 3 rapid requests to test concurrency handling..."

for i in {1..3}; do
  echo "Request $i:"
  response=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/claim_next_task" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${USER_TOKEN}" \
    -d '{}')
  
  echo "  Response: $response"
  sleep 1
done

# Test 3: Service role claim
echo -e "\n${YELLOW}Test 3: Service Role Claim${NC}"
echo "----------------------------"
echo "Testing with service role to see global concurrency enforcement..."

response=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/claim_next_task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -d '{"worker_id": "test_worker_123"}')

echo "Response: $response"

if echo "$response" | grep -q "task_id"; then
  echo -e "${GREEN}✅ Service role claimed a task${NC}"
elif echo "$response" | grep -q "No queued tasks"; then
  echo -e "${YELLOW}⚠️  No eligible tasks available (all users may be at limit)${NC}"
else
  echo -e "${RED}❌ Unexpected response${NC}"
fi

echo -e "\n${BLUE}Test Summary:${NC}"
echo "============="
echo "- User token claims should respect the 5-task limit per user"
echo "- Service role should skip tasks from users who are at their limit" 
echo "- Multiple rapid requests should be handled safely"
echo ""
echo -e "${YELLOW}Note: Update SUPABASE_URL, USER_TOKEN, and SERVICE_KEY at the top of this script${NC}" 