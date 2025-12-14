#!/bin/bash
# Run all complete_task tests
#
# Usage:
#   ./run_all.sh          # Run tests and compare with golden files
#   ./run_all.sh --update # Update golden files

set -e

cd "$(dirname "$0")/.."

echo "============================================"
echo "  complete_task Test Suite"
echo "============================================"
echo ""

# Run unit tests first (faster, catches pure function errors)
echo "▶ Running unit tests..."
npx -y deno test --no-check --allow-read --allow-env test/unit_tests.ts
echo ""

# Run scenario tests (captures full behavior)
echo "▶ Running scenario tests..."
if [ "$1" == "--update" ]; then
  # allow-net needed for imagescript (thumbnail generation) wasm fetch from deno.land
  npx -y deno run --allow-read --allow-write --allow-env --allow-net=deno.land,esm.sh test/runner.ts --update
else
  npx -y deno run --allow-read --allow-write --allow-env --allow-net=deno.land,esm.sh test/runner.ts
fi

echo ""
echo "============================================"
echo "  All tests complete!"
echo "============================================"

