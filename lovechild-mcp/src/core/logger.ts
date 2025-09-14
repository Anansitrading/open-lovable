import winston from 'winston';
import fs from 'fs-extra';
import path from 'path';
import { configManager } from './config.js';
import { Logger } from '../types/index.js';

class LoveChildLogger implements Logger {
  private winston: winston.Logger;
  private static instance: LoveChildLogger;

  private constructor() {
    this.winston = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'lovechild-mcp' },
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
            })
          )
        })
      ]
    });
  }

  static getInstance(): LoveChildLogger {
    if (!LoveChildLogger.instance) {
      LoveChildLogger.instance = new LoveChildLogger();
    }
    return LoveChildLogger.instance;
  }

  async initialize(): Promise<void> {
    try {
      const config = configManager.getConfig();
      
      // Update log level
      this.winston.level = config.logging?.level || 'info';

      // Add file transport if specified
      if (config.logging?.file) {
        const logDir = path.dirname(config.logging.file);
        await fs.ensureDir(logDir);

        this.winston.add(new winston.transports.File({
          filename: config.logging.file,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        }));

        // Also add error-only file
        const errorLogFile = config.logging.file.replace(/\.log$/, '.error.log');
        this.winston.add(new winston.transports.File({
          filename: errorLogFile,
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        }));
      }

      this.info('Logger initialized', { level: this.winston.level, transports: this.winston.transports.length });
    } catch (error) {
      console.error('Failed to initialize logger:', error);
      // Continue with console-only logging
    }
  }

  error(message: string, meta?: any): void {
    this.winston.error(message, this.sanitizeMeta(meta));
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, this.sanitizeMeta(meta));
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, this.sanitizeMeta(meta));
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, this.sanitizeMeta(meta));
  }

  // Specialized logging methods for MCP operations
  toolStart(toolName: string, input: any, correlationId?: string): void {
    this.info(`Tool started: ${toolName}`, {
      tool: toolName,
      correlationId,
      input: this.redactSensitiveData(input)
    });
  }

  toolSuccess(toolName: string, executionTime: number, correlationId?: string): void {
    this.info(`Tool completed: ${toolName}`, {
      tool: toolName,
      correlationId,
      executionTime,
      status: 'success'
    });
  }

  toolError(toolName: string, error: any, executionTime: number, correlationId?: string): void {
    this.error(`Tool failed: ${toolName}`, {
      tool: toolName,
      correlationId,
      executionTime,
      status: 'error',
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    });
  }

  mcpRequest(method: string, params: any): void {
    this.debug('MCP request received', {
      method,
      params: this.redactSensitiveData(params),
      timestamp: new Date().toISOString()
    });
  }

  mcpResponse(method: string, result: any, error?: any): void {
    if (error) {
      this.error('MCP request failed', {
        method,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message
        } : error
      });
    } else {
      this.debug('MCP request completed', {
        method,
        hasResult: !!result,
        timestamp: new Date().toISOString()
      });
    }
  }

  workflowStateChange(oldPhase: string, newPhase: string, workflowId: string): void {
    this.info('Workflow phase changed', {
      workflowId,
      oldPhase,
      newPhase,
      timestamp: new Date().toISOString()
    });
  }

  sandboxOperation(operation: string, sandboxId?: string, details?: any): void {
    this.info(`Sandbox operation: ${operation}`, {
      operation,
      sandboxId,
      details: this.redactSensitiveData(details)
    });
  }

  aiRequest(provider: string, model?: string, tokenUsage?: any): void {
    this.debug('AI request made', {
      provider,
      model,
      tokenUsage
    });
  }

  private sanitizeMeta(meta: any): any {
    if (!meta) return {};
    
    // Create a clean copy of meta
    const sanitized = { ...meta };
    
    // Add correlation ID if available
    if (!sanitized.correlationId) {
      sanitized.correlationId = this.generateCorrelationId();
    }
    
    return this.redactSensitiveData(sanitized);
  }

  private redactSensitiveData(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sensitiveKeys = [
      'apiKey', 'token', 'password', 'secret', 'key', 'auth',
      'authorization', 'credentials', 'api_key', 'access_token'
    ];
    
    const redacted = Array.isArray(obj) ? [...obj] : { ...obj };
    
    for (const key in redacted) {
      if (typeof key === 'string' && sensitiveKeys.some(sensitive => 
        key.toLowerCase().includes(sensitive)
      )) {
        redacted[key] = '[REDACTED]';
      } else if (redacted[key] && typeof redacted[key] === 'object') {
        redacted[key] = this.redactSensitiveData(redacted[key]);
      }
    }
    
    return redacted;
  }

  private generateCorrelationId(): string {
    return `lc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Performance measurement helpers
  startTimer(label: string): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
      this.debug(`Timer: ${label}`, { duration, unit: 'ms' });
      return duration;
    };
  }

  // Context-aware logging for streaming operations
  createStreamLogger(toolName: string, correlationId: string) {
    return {
      chunk: (data: any) => this.debug(`Stream chunk: ${toolName}`, {
        tool: toolName,
        correlationId,
        chunkSize: typeof data === 'string' ? data.length : JSON.stringify(data).length
      }),
      
      complete: (totalSize: number, duration: number) => this.info(`Stream completed: ${toolName}`, {
        tool: toolName,
        correlationId,
        totalSize,
        duration,
        throughput: totalSize / duration
      }),
      
      error: (error: any) => this.error(`Stream error: ${toolName}`, {
        tool: toolName,
        correlationId,
        error
      })
    };
  }

  // Health check logging
  healthCheck(component: string, status: 'healthy' | 'unhealthy', details?: any): void {
    const level = status === 'healthy' ? 'debug' : 'error';
    this.winston.log(level, `Health check: ${component}`, {
      component,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  }
}

// Export singleton instance
export const logger = LoveChildLogger.getInstance();