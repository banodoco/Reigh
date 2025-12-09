// deno-lint-ignore-file
/**
 * System Logger for Edge Functions
 * 
 * Logs to both console (for immediate visibility) AND system_logs table (for persistence/querying).
 * Uses a buffer pattern to batch database writes for efficiency.
 * 
 * Usage:
 *   const logger = new SystemLogger(supabaseAdmin, 'my-function-name');
 *   logger.info('Processing request', { task_id, shot_id });
 *   logger.error('Something failed', { task_id, error: err.message });
 *   await logger.flush(); // Call before returning response
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface LogContext {
  task_id?: string;
  shot_id?: string;
  user_id?: string;
  [key: string]: any;
}

interface BufferedLog {
  timestamp: string;
  source_type: string;
  source_id: string;
  log_level: LogLevel;
  message: string;
  task_id: string | null;
  metadata: Record<string, any>;
}

export class SystemLogger {
  private supabaseAdmin: any;
  private functionName: string;
  private logPrefix: string;
  private logBuffer: BufferedLog[] = [];
  private defaultTaskId: string | null = null;

  constructor(supabaseAdmin: any, functionName: string, defaultTaskId?: string) {
    this.supabaseAdmin = supabaseAdmin;
    this.functionName = functionName;
    this.logPrefix = `[${functionName.toUpperCase()}]`;
    this.defaultTaskId = defaultTaskId || null;
  }

  /**
   * Set a default task_id that will be used for all subsequent logs
   * Useful when you learn the task_id after construction
   */
  setDefaultTaskId(taskId: string | null) {
    this.defaultTaskId = taskId;
  }

  private addToBuffer(level: LogLevel, message: string, context?: LogContext) {
    const { task_id, ...metadata } = context || {};
    
    this.logBuffer.push({
      timestamp: new Date().toISOString(),
      source_type: 'edge_function',
      source_id: this.functionName,
      log_level: level,
      message,
      task_id: task_id || this.defaultTaskId,
      metadata
    });
  }

  debug(message: string, context?: LogContext) {
    console.log(`${this.logPrefix} ${message}`, context ? JSON.stringify(context) : '');
    this.addToBuffer('DEBUG', message, context);
  }

  info(message: string, context?: LogContext) {
    console.log(`${this.logPrefix} ${message}`, context ? JSON.stringify(context) : '');
    this.addToBuffer('INFO', message, context);
  }

  warn(message: string, context?: LogContext) {
    console.warn(`${this.logPrefix} ⚠️ ${message}`, context ? JSON.stringify(context) : '');
    this.addToBuffer('WARNING', message, context);
  }

  error(message: string, context?: LogContext) {
    console.error(`${this.logPrefix} ❌ ${message}`, context ? JSON.stringify(context) : '');
    this.addToBuffer('ERROR', message, context);
  }

  critical(message: string, context?: LogContext) {
    console.error(`${this.logPrefix} 🔥 CRITICAL: ${message}`, context ? JSON.stringify(context) : '');
    this.addToBuffer('CRITICAL', message, context);
  }

  /**
   * Flush all buffered logs to the database
   * Call this before returning your response!
   */
  async flush(): Promise<{ inserted: number; errors: number }> {
    if (this.logBuffer.length === 0) {
      return { inserted: 0, errors: 0 };
    }

    try {
      const { data, error } = await this.supabaseAdmin
        .rpc('func_insert_logs_batch', { logs: this.logBuffer });

      if (error) {
        console.error(`${this.logPrefix} Failed to flush ${this.logBuffer.length} logs to database:`, error.message);
        // Don't clear buffer on error - logs are lost but at least console has them
        return { inserted: 0, errors: this.logBuffer.length };
      }

      const result = data || { inserted: this.logBuffer.length, errors: 0 };
      const bufferSize = this.logBuffer.length;
      this.logBuffer = []; // Clear buffer after successful flush
      
      console.log(`${this.logPrefix} Flushed ${bufferSize} logs to database`);
      return { inserted: result.inserted || bufferSize, errors: result.errors || 0 };
    } catch (e: any) {
      console.error(`${this.logPrefix} Exception flushing logs:`, e?.message || e);
      return { inserted: 0, errors: this.logBuffer.length };
    }
  }

  /**
   * Get the current buffer size (useful for debugging)
   */
  getBufferSize(): number {
    return this.logBuffer.length;
  }
}

