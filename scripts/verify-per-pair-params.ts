#!/usr/bin/env tsx

/**
 * Automated verification script for Phase 2: Frontend Verification
 *
 * This script performs static code analysis to verify that the per-pair parameter
 * implementation is complete and follows the correct patterns.
 *
 * While this cannot replace manual browser testing, it can verify:
 * 1. All required interfaces are defined
 * 2. Data flows from metadata -> arrays -> task creation
 * 3. Code follows the same pattern as prompts (which is known to work)
 *
 * Usage: npx tsx scripts/verify-per-pair-params.ts
 */

import fs from 'fs';
import path from 'path';

interface VerificationResult {
  category: string;
  checks: Array<{
    name: string;
    passed: boolean;
    details?: string;
  }>;
}

const results: VerificationResult[] = [];

function addCheck(category: string, name: string, passed: boolean, details?: string) {
  let categoryResult = results.find(r => r.category === category);
  if (!categoryResult) {
    categoryResult = { category, checks: [] };
    results.push(categoryResult);
  }
  categoryResult.checks.push({ name, passed, details });
}

function checkFileContains(filePath: string, pattern: string | RegExp, checkName: string, category: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const found = typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
    addCheck(category, checkName, found, found ? 'Found' : `Not found in ${filePath}`);
    return found;
  } catch (error) {
    addCheck(category, checkName, false, `Error reading ${filePath}: ${error}`);
    return false;
  }
}

console.log('🔍 Per-Pair Parameter Implementation Verification\n');
console.log('=' .repeat(80));

// =============================================================================
// 1. DATA MODEL VERIFICATION
// =============================================================================
console.log('\n📦 Checking Data Model (src/types/shots.ts)...\n');

checkFileContains(
  'src/types/shots.ts',
  'pair_phase_config?:',
  'GenerationMetadata includes pair_phase_config',
  'Data Model'
);

checkFileContains(
  'src/types/shots.ts',
  'pair_loras?:',
  'GenerationMetadata includes pair_loras',
  'Data Model'
);

checkFileContains(
  'src/types/shots.ts',
  'pair_motion_settings?:',
  'GenerationMetadata includes pair_motion_settings',
  'Data Model'
);

// =============================================================================
// 2. TASK PARAMS INTERFACE VERIFICATION
// =============================================================================
console.log('\n📋 Checking Task Params Interface (src/shared/lib/tasks/travelBetweenImages.ts)...\n');

checkFileContains(
  'src/shared/lib/tasks/travelBetweenImages.ts',
  'pair_phase_configs?:',
  'TravelBetweenImagesTaskParams includes pair_phase_configs array',
  'Task Params'
);

checkFileContains(
  'src/shared/lib/tasks/travelBetweenImages.ts',
  'pair_loras?:',
  'TravelBetweenImagesTaskParams includes pair_loras array',
  'Task Params'
);

checkFileContains(
  'src/shared/lib/tasks/travelBetweenImages.ts',
  'pair_motion_settings?:',
  'TravelBetweenImagesTaskParams includes pair_motion_settings array',
  'Task Params'
);

// =============================================================================
// 3. ORCHESTRATOR PAYLOAD VERIFICATION
// =============================================================================
console.log('\n🚀 Checking Orchestrator Payload Building...\n');

checkFileContains(
  'src/shared/lib/tasks/travelBetweenImages.ts',
  /pair_phase_configs:\s*params\.pair_phase_configs/,
  'pair_phase_configs passed to orchestrator',
  'Orchestrator Payload'
);

checkFileContains(
  'src/shared/lib/tasks/travelBetweenImages.ts',
  /pair_loras:\s*params\.pair_loras/,
  'pair_loras passed to orchestrator',
  'Orchestrator Payload'
);

checkFileContains(
  'src/shared/lib/tasks/travelBetweenImages.ts',
  /pair_motion_settings:\s*params\.pair_motion_settings/,
  'pair_motion_settings passed to orchestrator',
  'Orchestrator Payload'
);

// =============================================================================
// 4. DATA LOADING VERIFICATION (generateVideoService.ts)
// =============================================================================
console.log('\n📥 Checking Data Loading from Database...\n');

const generateVideoServicePath = 'src/tools/travel-between-images/components/ShotEditor/services/generateVideoService.ts';

checkFileContains(
  generateVideoServicePath,
  'pairPhaseConfigsOverrides',
  'Loads pair_phase_config from metadata',
  'Data Loading'
);

checkFileContains(
  generateVideoServicePath,
  'pairLorasOverrides',
  'Loads pair_loras from metadata',
  'Data Loading'
);

checkFileContains(
  generateVideoServicePath,
  'pairMotionSettingsOverrides',
  'Loads pair_motion_settings from metadata',
  'Data Loading'
);

// =============================================================================
// 5. ARRAY BUILDING VERIFICATION
// =============================================================================
console.log('\n🔨 Checking Array Building Logic...\n');

checkFileContains(
  generateVideoServicePath,
  'pairPhaseConfigsArray',
  'Builds pairPhaseConfigsArray',
  'Array Building'
);

checkFileContains(
  generateVideoServicePath,
  'pairLorasArray',
  'Builds pairLorasArray',
  'Array Building'
);

checkFileContains(
  generateVideoServicePath,
  'pairMotionSettingsArray',
  'Builds pairMotionSettingsArray',
  'Array Building'
);

// Check that arrays use null for defaults (same pattern as prompts)
checkFileContains(
  generateVideoServicePath,
  /\|\| null/,
  'Uses null for default values (same as prompts pattern)',
  'Array Building'
);

// =============================================================================
// 6. TASK CREATION VERIFICATION
// =============================================================================
console.log('\n✅ Checking Task Creation Parameters...\n');

checkFileContains(
  generateVideoServicePath,
  /pair_phase_configs:\s*pairPhaseConfigsArray/,
  'Passes pairPhaseConfigsArray to task creation',
  'Task Creation'
);

checkFileContains(
  generateVideoServicePath,
  /pair_loras:\s*pairLorasArray/,
  'Passes pairLorasArray to task creation',
  'Task Creation'
);

checkFileContains(
  generateVideoServicePath,
  /pair_motion_settings:\s*pairMotionSettingsArray/,
  'Passes pairMotionSettingsArray to task creation',
  'Task Creation'
);

// Check that arrays are only sent when they have overrides (efficiency)
checkFileContains(
  generateVideoServicePath,
  /\.some\(x => x !== null\)/,
  'Only sends arrays when there are actual overrides',
  'Task Creation'
);

// =============================================================================
// 7. PATTERN CONSISTENCY CHECK
// =============================================================================
console.log('\n🔄 Checking Pattern Consistency with Prompts...\n');

// Check that the code uses the same pattern for building arrays as prompts
const serviceContent = fs.readFileSync(generateVideoServicePath, 'utf-8');

// Check for prompt array building pattern
const hasPromptPattern = /basePrompts\s*=.*?\.map\(/s.test(serviceContent);
addCheck(
  'Pattern Consistency',
  'Uses same map() pattern as prompts',
  hasPromptPattern,
  hasPromptPattern ? 'Same pattern confirmed' : 'Pattern differs from prompts'
);

// Check for null coalescing (|| null pattern)
const hasNullCoalescing = /pairPhaseConfigsOverrides\[index\]\s*\|\|\s*null/.test(serviceContent);
addCheck(
  'Pattern Consistency',
  'Uses || null pattern (same as prompts)',
  hasNullCoalescing,
  hasNullCoalescing ? 'Confirmed' : 'Different pattern used'
);

// =============================================================================
// RESULTS SUMMARY
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log('\n📊 VERIFICATION RESULTS\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks: Array<{ category: string; name: string; details?: string }> = [];

results.forEach(result => {
  const passed = result.checks.filter(c => c.passed).length;
  const total = result.checks.length;
  const icon = passed === total ? '✅' : '⚠️';

  console.log(`${icon} ${result.category}: ${passed}/${total} passed`);

  result.checks.forEach(check => {
    totalChecks++;
    if (check.passed) {
      passedChecks++;
      console.log(`   ✓ ${check.name}`);
    } else {
      failedChecks.push({
        category: result.category,
        name: check.name,
        details: check.details
      });
      console.log(`   ✗ ${check.name}`);
      if (check.details) {
        console.log(`     ${check.details}`);
      }
    }
  });
  console.log('');
});

console.log('='.repeat(80));
console.log(`\nOVERALL: ${passedChecks}/${totalChecks} checks passed (${Math.round(passedChecks/totalChecks*100)}%)\n`);

if (failedChecks.length > 0) {
  console.log('❌ FAILED CHECKS:\n');
  failedChecks.forEach(f => {
    console.log(`  • [${f.category}] ${f.name}`);
    if (f.details) console.log(`    ${f.details}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('✅ All automated checks passed!\n');
  console.log('⚠️  NOTE: This verification covers code structure only.');
  console.log('   Manual browser testing is still required to verify runtime behavior.\n');
  console.log('   See INDEX.md for test scenarios 1-6.\n');
  process.exit(0);
}
