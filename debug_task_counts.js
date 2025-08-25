#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wczysqzxlwdndgxitrvc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUwMjg2OCwiZXhwIjoyMDY3MDc4ODY4fQ.fUHMa3zgfdOu95cAKTz5cd7aSruIcGE7ukVSQI-YuiU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Helper script to extract and display task count data from the enhanced claim-next-task function
 * Usage: node debug_task_counts.js [service|user] [user_id_if_user_mode]
 */

async function getCountData(mode = 'service', userId = null) {
  console.log(`🔍 Fetching ${mode} mode count data${userId ? ` for user ${userId}` : ''}...`);
  
  const url = `${SUPABASE_URL}/functions/v1/claim-next-task`;
  const headers = {
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };
  
  // For user mode, you'd typically use a user PAT token instead
  const body = { count: true };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch count data:', error.message);
    return null;
  }
}

function displayServiceData(data) {
  console.log('\n📊 SERVICE-ROLE COUNT DATA');
  console.log('=' .repeat(50));
  console.log(`Timestamp: ${data.timestamp}`);
  console.log(`\n🎯 TOTALS:`);
  console.log(`  Queued only:        ${data.totals.queued_only}`);
  console.log(`  Active only:        ${data.totals.active_only}`);
  console.log(`  Queued + Active:    ${data.totals.queued_plus_active}`);
  
  console.log(`\n🌍 GLOBAL BREAKDOWN:`);
  const gb = data.global_task_breakdown;
  console.log(`  Queued total:       ${gb.queued_total}`);
  console.log(`  In Progress total:  ${gb.in_progress_total}`);
  console.log(`  ├─ Cloud:           ${gb.in_progress_cloud}`);
  console.log(`  ├─ Local:           ${gb.in_progress_local}`);
  console.log(`  └─ Orchestrator:    ${gb.orchestrator_tasks}`);
  
  console.log(`\n👥 USERS (top 10):`);
  (data.users || []).slice(0, 10).forEach(u => {
    const status = u.at_limit ? '❌ AT LIMIT' : '✅ Under limit';
    console.log(`  ${u.user_id}: ${u.in_progress_tasks} active, ${u.queued_tasks} queued, ${u.credits} credits ${status}`);
  });
  
  console.log(`\n⏰ RECENT TASKS:`);
  data.recent_tasks.forEach(t => {
    const cloudIcon = t.is_cloud ? '☁️' : '💻';
    console.log(`  ${cloudIcon} ${t.type} (${t.status}) - ${t.age_minutes}min ago`);
  });
}

function displayUserData(data) {
  console.log('\n📊 USER COUNT DATA');
  console.log('=' .repeat(50));
  console.log(`User ID: ${data.user_id}`);
  console.log(`Timestamp: ${data.timestamp}`);
  
  console.log(`\n🎯 CAPACITIES:`);
  const t = data.totals;
  console.log(`  Queued only capacity:           ${t.queued_only_capacity}`);
  console.log(`  Active only capacity:           ${t.active_only_capacity}`);
  console.log(`  Queued + Active capacity:       ${t.queued_plus_active_capacity}`);
  console.log(`  Eligible queued:                ${t.eligible_queued}`);
  
  console.log(`\n📈 LIVE METRICS:`);
  console.log(`  In Progress (any):              ${t.in_progress_any}/5`);
  console.log(`  In Progress (cloud):            ${t.in_progress_cloud}`);
  console.log(`  In Progress (cloud, non-orch):  ${t.in_progress_cloud_non_orchestrator}`);
  
  console.log(`\n🔍 DEBUG SUMMARY:`);
  const ds = data.debug_summary;
  console.log(`  At capacity:        ${ds.at_capacity ? 'YES' : 'NO'}`);
  console.log(`  Capacity used:      ${ds.capacity_used_pct}%`);
  console.log(`  Orchestrator count: ${ds.orchestrator_count}`);
  console.log(`  Queued with deps:   ${ds.queued_with_deps}`);
  console.log(`  Can claim more:     ${ds.can_claim_more ? 'YES' : 'NO'}`);
  
  console.log(`\n⏰ RECENT TASKS:`);
  data.recent_tasks.slice(0, 10).forEach(t => {
    const cloudIcon = t.is_cloud ? '☁️' : '💻';
    const depIcon = t.has_dependency ? '🔗' : '  ';
    console.log(`  ${cloudIcon}${depIcon} ${t.type} (${t.status}) - ${t.age_minutes}min ago`);
  });
}

async function main() {
  const mode = process.argv[2] || 'service';
  const userId = process.argv[3];
  
  if (mode === 'user' && !userId) {
    console.error('User mode requires a user_id argument');
    console.log('Usage: node debug_task_counts.js user <user_id>');
    process.exit(1);
  }
  
  const data = await getCountData(mode, userId);
  if (!data) {
    process.exit(1);
  }
  
  if (mode === 'service') {
    displayServiceData(data);
  } else {
    displayUserData(data);
  }
  
  // JSON output for piping/parsing
  if (process.argv.includes('--json')) {
    console.log('\n📋 RAW JSON:');
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
