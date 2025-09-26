/**
 * Simple logging utility with environment-based filtering
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private enableVerbose = this.isDevelopment || process.env.VITE_ENABLE_VERBOSE_LOGGING === 'true';

  private formatMessage(tag: string, message: string, data?: LogData): [string, LogData?] {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${tag} ${message}`;
    return data ? [formattedMessage, data] : [formattedMessage];
  }

  debug(tag: string, message: string, data?: LogData) {
    if (this.enableVerbose) {
      const [msg, logData] = this.formatMessage(tag, message, data);
      if (logData) {
        console.log(msg, logData);
      } else {
        console.log(msg);
      }
    }
  }

  info(tag: string, message: string, data?: LogData) {
    const [msg, logData] = this.formatMessage(tag, message, data);
    if (logData) {
      console.log(msg, logData);
    } else {
      console.log(msg);
    }
  }

  warn(tag: string, message: string, data?: LogData) {
    const [msg, logData] = this.formatMessage(tag, message, data);
    if (logData) {
      console.warn(msg, logData);
    } else {
      console.warn(msg);
    }
  }

  error(tag: string, message: string, data?: LogData) {
    const [msg, logData] = this.formatMessage(tag, message, data);
    if (logData) {
      console.error(msg, logData);
    } else {
      console.error(msg);
    }
  }

  // Legacy console.log compatibility for gradual migration
  log(message: string, data?: LogData) {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for consumers
export type { LogLevel, LogData };
