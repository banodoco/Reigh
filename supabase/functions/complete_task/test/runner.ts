/**
 * Test runner for complete_task edge function
 * 
 * This captures the behavior of the current implementation to create
 * "golden" snapshots that can be compared after refactoring.
 * 
 * Usage:
 *   deno run --allow-read --allow-write --allow-env runner.ts [--update]
 * 
 * Flags:
 *   --update    Update golden files instead of comparing
 */

import { 
  OperationCapture, 
  createMockSupabase, 
  createMockFetch,
  createMockRequest,
  MockConfig,
} from './mocks.ts';
import { TEST_SCENARIOS, TestScenario } from './fixtures.ts';

// Provide a loose Deno type for local tooling / TS linters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

// Colors for console output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

interface TestResult {
  scenario: string;
  passed: boolean;
  statusCode: number;
  expectedStatusCode: number;
  operations: any[];
  responseBody?: any;
  error?: string;
}

function getArgValue(args: string[], name: string): string | undefined {
  const idx = args.findIndex((a) => a === name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function toFileUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('file://')) return pathOrUrl;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  // Assume local absolute or relative path
  try {
    return new URL(pathOrUrl, `file://${Deno.cwd()}/`).href;
  } catch {
    return `file://${pathOrUrl}`;
  }
}

async function loadHandler(targetModuleUrl?: string): Promise<(req: Request, deps?: any) => Promise<Response>> {
  const target = targetModuleUrl ?? new URL('../index.ts', import.meta.url).href;
  const mod = await import(target);
  if (typeof mod.completeTaskHandler !== 'function') {
    throw new Error(`Target module does not export completeTaskHandler: ${target}`);
  }
  return mod.completeTaskHandler;
}

/**
 * Run a scenario against the REAL handler using injected mocks.
 */
async function runScenario(
  scenario: TestScenario,
  capture: OperationCapture,
  handler: (req: Request, deps?: any) => Promise<Response>
): Promise<TestResult> {
  capture.clear();
  
  const result: TestResult = {
    scenario: scenario.name,
    passed: false,
    statusCode: 0,
    expectedStatusCode: scenario.expectedStatusCode,
    operations: [],
  };
  
  try {
    // Create mock request
    const request = createMockRequest(scenario.request);
    
    // Create mock Supabase with scenario config
    const mockSupabase = createMockSupabase(scenario.mockConfig, capture);
    
    // Create mock fetch
    const mockFetch = createMockFetch(capture);
    
    // Inject global fetch so internal cost/orchestrator calls are captured.
    // (The handler uses global fetch in triggerCostCalculation.)
    const originalFetch = globalThis.fetch;
    // @ts-ignore
    globalThis.fetch = mockFetch;

    // Minimal logger stub to avoid DB writes for logging in tests
    class TestLogger {
      constructor(_supabase: any, _fnName: string, _taskId: string) {}
      info(_msg: string, _meta?: any) {}
      error(_msg: string, _meta?: any) {}
      critical(_msg: string, _meta?: any) {}
      async flush() {}
    }

    // Auth stubs: allow all requests as the task owner (non-service role)
    const task = scenario.mockConfig.tasks[scenario.request.task_id];
    const callerId = task?.user_id || 'test-user';
    const deps = {
      env: { get: (k: string) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'test-service-key' : k === 'SUPABASE_URL' ? 'https://mock.supabase.co' : undefined) },
      supabaseAdmin: mockSupabase,
      LoggerClass: TestLogger,
      authenticateRequest: async (_req: Request, _supabase: any, _tag: string) => ({ success: true, isServiceRole: false, userId: callerId }),
      verifyTaskOwnership: async (_supabase: any, _taskId: string, _caller: string, _tag: string) => ({ success: true }),
      getTaskUserId: async (_supabase: any, taskId: string, _tag: string) => ({ userId: scenario.mockConfig.tasks[taskId]?.user_id, error: null, statusCode: 200 }),
    };

    const resp = await handler(request, deps);
    result.statusCode = resp.status;
    result.passed = result.statusCode === scenario.expectedStatusCode;
    result.operations = [...capture.operations];

    try {
      const txt = await resp.text();
      result.responseBody = txt;
    } catch {
      // ignore
    }

    // Restore fetch
    // @ts-ignore
    globalThis.fetch = originalFetch;
    
  } catch (error: any) {
    result.error = error.message;
    result.statusCode = 500;
    result.operations = [...capture.operations];
  }
  
  return result;
}

/**
 * Run all test scenarios and output results
 */
async function runAllTests(updateGolden: boolean = false): Promise<void> {
  console.log('\n========================================');
  console.log('  complete_task Test Runner');
  console.log('========================================\n');
  
  const capture = new OperationCapture();
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  const targetArg = getArgValue(Deno.args, '--target');
  const targetUrl = targetArg ? toFileUrl(targetArg) : undefined;
  const handler = await loadHandler(targetUrl);
  
  for (const scenario of TEST_SCENARIOS) {
    console.log(`Running: ${scenario.name}`);
    console.log(`  ${scenario.description}`);
    
    const result = await runScenario(scenario, capture, handler);
    results.push(result);
    
    if (result.passed) {
      console.log(`  ${GREEN}✓ PASSED${RESET} (status: ${result.statusCode})`);
      passed++;
    } else {
      console.log(`  ${RED}✗ FAILED${RESET}`);
      console.log(`    Expected status: ${result.expectedStatusCode}, Got: ${result.statusCode}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      failed++;
    }
    
    console.log(`  Operations captured: ${result.operations.length}`);
    console.log('');
  }
  
  // Summary
  console.log('========================================');
  console.log(`  Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ''}${failed} failed${RESET}`);
  console.log('========================================\n');
  
  // Save results
  const outputPath = new URL('./golden/results.json', import.meta.url).pathname;
  const goldenDir = new URL('./golden', import.meta.url).pathname;
  
  try {
    await Deno.mkdir(goldenDir, { recursive: true });
  } catch {
    // Directory may already exist
  }
  
  if (updateGolden) {
    console.log(`${YELLOW}Updating golden files...${RESET}`);
    await Deno.writeTextFile(
      outputPath,
      JSON.stringify(results, null, 2)
    );
    console.log(`  Saved to: ${outputPath}`);
  } else {
    // Compare with existing golden file
    try {
      const existingGolden = await Deno.readTextFile(outputPath);
      const existing = JSON.parse(existingGolden);
      
      // Compare operation counts per scenario
      console.log('\nComparing with golden file...');
      let diffs = 0;
      
      for (const result of results) {
        const golden = existing.find((r: TestResult) => r.scenario === result.scenario);
        if (!golden) {
          console.log(`  ${YELLOW}NEW: ${result.scenario}${RESET}`);
          diffs++;
        } else if (golden.operations.length !== result.operations.length) {
          console.log(`  ${RED}DIFF: ${result.scenario}${RESET}`);
          console.log(`    Golden: ${golden.operations.length} ops, Current: ${result.operations.length} ops`);
          diffs++;
        }
      }
      
      if (diffs === 0) {
        console.log(`  ${GREEN}✓ All scenarios match golden file${RESET}`);
      } else {
        console.log(`\n  ${YELLOW}${diffs} differences found. Run with --update to update golden files.${RESET}`);
      }
      
    } catch {
      console.log(`${YELLOW}No golden file found. Run with --update to create one.${RESET}`);
    }
  }
  
  // Exit with error code if tests failed
  if (failed > 0) {
    Deno.exit(1);
  }
}

// Main entry point
const args = Deno.args;
const updateGolden = args.includes('--update');

runAllTests(updateGolden);

