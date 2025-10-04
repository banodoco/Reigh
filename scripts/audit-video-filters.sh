#!/bin/bash
# Audit script to find inconsistent video filtering logic
# Run this after making changes to ensure all filters are consistent

echo "🔍 Auditing video filters in travel-between-images tool..."
echo ""

echo "📋 All places checking for video types:"
echo "========================================"
grep -rn "type === 'video'" --include="*.ts" --include="*.tsx" src/tools/travel-between-images/ | grep -v ".backup" | grep -v "shot-generation-filters.ts"
echo ""

echo "📋 All places filtering shotGenerations:"
echo "========================================"
grep -rn "shotGenerations\.filter\|\.filter.*sg.*=>" --include="*.ts" --include="*.tsx" src/tools/travel-between-images/ | grep -v ".backup"
echo ""

echo "⚠️  Places checking timeline_frame !== null (potential issues):"
echo "================================================================"
grep -rn "timeline_frame.*!==.*null\|timeline_frame.*===.*null" --include="*.ts" --include="*.tsx" src/tools/travel-between-images/ | grep -v ".backup" | grep -v "shot-generation-filters.ts"
echo ""

echo "✅ Done! Review the output above for inconsistencies."
echo ""
echo "💡 All filters should match the canonical filter in:"
echo "   src/tools/travel-between-images/utils/shot-generation-filters.ts"
echo ""
echo "🔑 Key rule: When working with pairs, ONLY filter out videos,"
echo "   NOT items with timeline_frame: null"
