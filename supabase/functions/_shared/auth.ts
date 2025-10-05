// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Authentication result for edge functions
 */
export interface AuthResult {
  isServiceRole: boolean;
  userId: string | null; // Set if user token (PAT)
  success: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Authenticates a request using Bearer token (Service Role Key, JWT, or PAT)
 * 
 * This function handles three types of authentication:
 * 1. Service Role Key - Direct match with SUPABASE_SERVICE_ROLE_KEY
 * 2. JWT with service_role/supabase_admin role
 * 3. Personal Access Token (PAT) - Looked up in user_api_tokens table
 * 
 * @param req - The incoming HTTP request
 * @param supabaseAdmin - Supabase admin client for database queries
 * @param logPrefix - Optional prefix for log messages (e.g., "[FUNCTION-NAME]")
 * @returns AuthResult with authentication details
 */
export async function authenticateRequest(
  req: Request,
  supabaseAdmin: any,
  logPrefix: string = "[AUTH]"
): Promise<AuthResult> {
  // Extract authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.error(`${logPrefix} Missing or invalid Authorization header`);
    return {
      isServiceRole: false,
      userId: null,
      success: false,
      error: "Missing or invalid Authorization header",
      statusCode: 401
    };
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey) {
    console.error(`${logPrefix} Missing SUPABASE_SERVICE_ROLE_KEY environment variable`);
    return {
      isServiceRole: false,
      userId: null,
      success: false,
      error: "Server configuration error",
      statusCode: 500
    };
  }

  // 1) Check if token matches service-role key directly (SECURE)
  if (token === serviceKey) {
    console.log(`${logPrefix} Direct service-role key match`);
    return {
      isServiceRole: true,
      userId: null,
      success: true
    };
  }

  // 2) Personal Access Token (PAT) - look up in user_api_tokens table (SECURE)
  // NOTE: We intentionally do NOT accept JWTs with service_role claims.
  // Only the actual service key can be used for service role access.
  // This prevents unsigned/forged JWTs from gaining elevated privileges.
  console.log(`${logPrefix} Looking up token in user_api_token table...`);
  
  const { data, error } = await supabaseAdmin
    .from("user_api_tokens")
    .select("user_id")
    .eq("token", token)
    .single();

  if (error || !data) {
    console.error(`${logPrefix} Token lookup failed:`, error);
    return {
      isServiceRole: false,
      userId: null,
      success: false,
      error: "Invalid or expired token",
      statusCode: 403
    };
  }

  const userId = data.user_id;
  console.log(`${logPrefix} Token resolved to user ID: ${userId}`);
  return {
    isServiceRole: false,
    userId,
    success: true
  };
}

/**
 * Verifies that a user owns a specific task
 * 
 * @param supabaseAdmin - Supabase admin client
 * @param taskId - Task ID to verify
 * @param userId - User ID to check ownership
 * @param logPrefix - Optional prefix for log messages
 * @returns Object with success status and optional error details
 */
export async function verifyTaskOwnership(
  supabaseAdmin: any,
  taskId: string,
  userId: string,
  logPrefix: string = "[AUTH]"
): Promise<{ success: boolean; error?: string; statusCode?: number; projectId?: string }> {
  console.log(`${logPrefix} Verifying task ${taskId} belongs to user ${userId}...`);

  // Get task and its project
  const { data: taskData, error: taskError } = await supabaseAdmin
    .from("tasks")
    .select("project_id")
    .eq("id", taskId)
    .single();

  if (taskError || !taskData) {
    console.error(`${logPrefix} Task lookup error:`, taskError);
    return {
      success: false,
      error: "Task not found",
      statusCode: 404
    };
  }

  // Check if user owns the project that this task belongs to
  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("user_id")
    .eq("id", taskData.project_id)
    .single();

  if (projectError || !projectData) {
    console.error(`${logPrefix} Project lookup error:`, projectError);
    return {
      success: false,
      error: "Project not found",
      statusCode: 404
    };
  }

  if (projectData.user_id !== userId) {
    console.error(`${logPrefix} Task ${taskId} belongs to project ${taskData.project_id} owned by ${projectData.user_id}, not user ${userId}`);
    return {
      success: false,
      error: "Forbidden: Task does not belong to user",
      statusCode: 403
    };
  }

  console.log(`${logPrefix} Task ${taskId} ownership verified: user ${userId} owns project ${taskData.project_id}`);
  return {
    success: true,
    projectId: taskData.project_id
  };
}

/**
 * Gets the user ID for a task (for service role requests)
 * 
 * @param supabaseAdmin - Supabase admin client
 * @param taskId - Task ID
 * @param logPrefix - Optional prefix for log messages
 * @returns Object with userId or error
 */
export async function getTaskUserId(
  supabaseAdmin: any,
  taskId: string,
  logPrefix: string = "[AUTH]"
): Promise<{ userId: string | null; error?: string; statusCode?: number }> {
  console.log(`${logPrefix} Looking up user for task ${taskId}`);

  const { data: taskData, error: taskError } = await supabaseAdmin
    .from("tasks")
    .select("project_id")
    .eq("id", taskId)
    .single();

  if (taskError || !taskData) {
    console.error(`${logPrefix} Task lookup error:`, taskError);
    return {
      userId: null,
      error: "Task not found",
      statusCode: 404
    };
  }

  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("user_id")
    .eq("id", taskData.project_id)
    .single();

  if (projectError || !projectData) {
    console.error(`${logPrefix} Project lookup error:`, projectError);
    // Fallback to system folder
    return {
      userId: 'system'
    };
  }

  console.log(`${logPrefix} Task ${taskId} belongs to user ${projectData.user_id}`);
  return {
    userId: projectData.user_id
  };
}
