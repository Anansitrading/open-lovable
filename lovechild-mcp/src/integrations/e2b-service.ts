import { Sandbox } from '@e2b/code-interpreter';
import { logger } from '../core/logger.js';
import { configManager } from '../core/config.js';
import { 
  LoveChildError, 
  E2BSandboxSession, 
  E2BFileOperation, 
  E2BCommandExecution, 
  E2BExecutionResult, 
  E2BSandboxOptions, 
  E2BPreviewInfo 
} from '../types/index.js';

export class E2BService {
  private sessions = new Map<string, Sandbox>();
  private sessionMetadata = new Map<string, E2BSandboxSession>();
  private correlationId: string;
  private initialized = false;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(correlationId?: string) {
    this.correlationId = correlationId || 'e2b-service';
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const config = configManager.getConfig();
      
      if (!config.integrations.e2b?.apiKey) {
        throw new LoveChildError(
          'E2B API key not configured. Please set E2B_API_KEY environment variable.',
          'E2B_NOT_CONFIGURED'
        );
      }

      // Set the API key as environment variable for the E2B SDK
      process.env.E2B_API_KEY = config.integrations.e2b.apiKey;
      
      this.initialized = true;
      
      // Setup cleanup interval for idle sessions
      this.startCleanupTimer();
      
      logger.info('E2B service initialized', {
        correlationId: this.correlationId,
        maxSessions: config.integrations.e2b.maxSessions,
        keepAliveMs: config.integrations.e2b.keepAliveMs
      });

    } catch (error) {
      logger.error('Failed to initialize E2B service', {
        correlationId: this.correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async createSandbox(options: E2BSandboxOptions = {}): Promise<E2BSandboxSession> {
    await this.initialize();

    const timer = logger.startTimer('e2b-create-sandbox');
    
    try {
      // Check session limits
      const config = configManager.getConfig();
      if (this.sessions.size >= config.integrations.e2b.maxSessions) {
        throw new LoveChildError(
          `Maximum number of sandboxes (${config.integrations.e2b.maxSessions}) reached. Please close existing sandboxes.`,
          'E2B_MAX_SESSIONS_REACHED'
        );
      }

      logger.info('Creating E2B sandbox', {
        correlationId: this.correlationId,
        template: options.template || 'nodejs',
        workflowId: options.workflowId,
        currentSessions: this.sessions.size
      });

      // Create the sandbox using E2B SDK
      const sandbox = options.template
        ? await Sandbox.create(options.template)
        : await Sandbox.create();

      const executionTime = timer();
      const now = new Date();

      // Create session metadata
      const sessionData: E2BSandboxSession = {
        id: `e2b-${sandbox.sandboxId}`,
        sessionId: sandbox.sandboxId,
        status: 'active',
        createdAt: now,
        lastActivity: now,
        files: [],
        workflowId: options.workflowId,
        metadata: {
          projectType: 'node', // Default, can be updated
          template: options.template || 'nodejs',
          environment: options.environment || {}
        }
      };

      // Store the session
      this.sessions.set(sessionData.id, sandbox);
      this.sessionMetadata.set(sessionData.id, sessionData);

      logger.info('E2B sandbox created successfully', {
        correlationId: this.correlationId,
        sessionId: sessionData.id,
        sandboxId: sandbox.sandboxId,
        executionTime,
        workflowId: options.workflowId
      });

      return sessionData;

    } catch (error) {
      const executionTime = timer();
      logger.error('Failed to create E2B sandbox', {
        correlationId: this.correlationId,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new LoveChildError(
        `Failed to create E2B sandbox: ${error instanceof Error ? error.message : String(error)}`,
        'E2B_CREATE_FAILED',
        error
      );
    }
  }

  async getSandbox(sessionId: string): Promise<E2BSandboxSession | null> {
    const metadata = this.sessionMetadata.get(sessionId);
    if (!metadata) {
      return null;
    }

    // Update last activity
    metadata.lastActivity = new Date();
    this.sessionMetadata.set(sessionId, metadata);

    return metadata;
  }

  async writeFiles(sessionId: string, files: Array<{ path: string; content: string }>): Promise<E2BFileOperation[]> {
    const sandbox = this.sessions.get(sessionId);
    if (!sandbox) {
      throw new LoveChildError(`Sandbox session ${sessionId} not found`, 'E2B_SESSION_NOT_FOUND');
    }

    const operations: E2BFileOperation[] = [];
    const timer = logger.startTimer('e2b-write-files');

    try {
      logger.info('Writing files to E2B sandbox', {
        correlationId: this.correlationId,
        sessionId,
        fileCount: files.length
      });

      for (const file of files) {
        // Ensure directory exists
        const dir = file.path.substring(0, file.path.lastIndexOf('/'));
        if (dir) {
          try {
            await sandbox.files.makeDir(dir);
            operations.push({
              type: 'mkdir',
              path: dir,
              timestamp: new Date()
            });
          } catch (error) {
            // Directory might already exist, that's okay
          }
        }

        // Write the file
        await sandbox.files.write(file.path, file.content);
        
        operations.push({
          type: 'write',
          path: file.path,
          content: file.content,
          timestamp: new Date()
        });

        // Update session metadata
        const metadata = this.sessionMetadata.get(sessionId);
        if (metadata) {
          if (!metadata.files.includes(file.path)) {
            metadata.files.push(file.path);
          }
          metadata.lastActivity = new Date();
          this.sessionMetadata.set(sessionId, metadata);
        }
      }

      const executionTime = timer();
      logger.info('Files written to E2B sandbox successfully', {
        correlationId: this.correlationId,
        sessionId,
        filesWritten: files.length,
        executionTime
      });

      return operations;

    } catch (error) {
      const executionTime = timer();
      logger.error('Failed to write files to E2B sandbox', {
        correlationId: this.correlationId,
        sessionId,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new LoveChildError(
        `Failed to write files to sandbox: ${error instanceof Error ? error.message : String(error)}`,
        'E2B_WRITE_FAILED',
        error
      );
    }
  }

  async executeCommand(sessionId: string, execution: E2BCommandExecution): Promise<E2BExecutionResult> {
    const sandbox = this.sessions.get(sessionId);
    if (!sandbox) {
      throw new LoveChildError(`Sandbox session ${sessionId} not found`, 'E2B_SESSION_NOT_FOUND');
    }

    const timer = logger.startTimer('e2b-execute-command');
    const startTime = new Date();

    try {
      logger.info('Executing command in E2B sandbox', {
        correlationId: this.correlationId,
        sessionId,
        command: execution.command,
        workingDir: execution.workingDir
      });

      // Execute the command using E2B's runCode method
      const result = await sandbox.runCode(execution.command, {
        timeoutMs: execution.timeout || 30000
      });

      const executionTime = timer();
      const duration = Date.now() - startTime.getTime();

      // Process the results from E2B
      const stdout: string[] = [];
      const stderr: string[] = [];
      let success = !result.error;
      let error: string | undefined;

      // E2B returns results in Execution format
      if (result.logs) {
        if (result.logs.stdout) {
          stdout.push(...result.logs.stdout);
        }
        if (result.logs.stderr) {
          stderr.push(...result.logs.stderr);
        }
      }
      
      // Check for execution error
      if (result.error) {
        success = false;
        error = result.error.value || result.error.name || 'Unknown error';
      }

      const execResult: E2BExecutionResult = {
        command: execution.command,
        exitCode: success ? 0 : 1,
        stdout,
        stderr,
        duration,
        timestamp: startTime,
        success,
        error
      };

      // Update session metadata
      const metadata = this.sessionMetadata.get(sessionId);
      if (metadata) {
        metadata.lastActivity = new Date();
        this.sessionMetadata.set(sessionId, metadata);
      }

      logger.info('Command executed in E2B sandbox', {
        correlationId: this.correlationId,
        sessionId,
        command: execution.command,
        success,
        executionTime,
        outputLines: stdout.length,
        errorLines: stderr.length
      });

      return execResult;

    } catch (error) {
      const executionTime = timer();
      const duration = Date.now() - startTime.getTime();
      
      logger.error('Command execution failed in E2B sandbox', {
        correlationId: this.correlationId,
        sessionId,
        command: execution.command,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        command: execution.command,
        exitCode: 1,
        stdout: [],
        stderr: [error instanceof Error ? error.message : String(error)],
        duration,
        timestamp: startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getPreviewInfo(sessionId: string, port: number = 3000): Promise<E2BPreviewInfo | null> {
    const sandbox = this.sessions.get(sessionId);
    const metadata = this.sessionMetadata.get(sessionId);
    
    if (!sandbox || !metadata) {
      return null;
    }

    try {
      // For E2B, we need to check if the port is exposed
      // This is a simplified approach - in production, you'd want to implement proper port detection
      const previewUrl = `https://${sandbox.sandboxId}-${port}.e2b.dev`;
      
      const previewInfo: E2BPreviewInfo = {
        url: previewUrl,
        port,
        protocol: 'https',
        status: 'running', // Assume running for now
        lastCheck: new Date()
      };

      // Update session metadata with preview info
      metadata.previewUrl = previewUrl;
      metadata.previewPort = port;
      this.sessionMetadata.set(sessionId, metadata);

      logger.info('Preview info generated', {
        correlationId: this.correlationId,
        sessionId,
        previewUrl,
        port
      });

      return previewInfo;

    } catch (error) {
      logger.error('Failed to get preview info', {
        correlationId: this.correlationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async closeSandbox(sessionId: string): Promise<boolean> {
    const sandbox = this.sessions.get(sessionId);
    const metadata = this.sessionMetadata.get(sessionId);

    if (!sandbox || !metadata) {
      logger.warn('Attempted to close non-existent sandbox', {
        correlationId: this.correlationId,
        sessionId
      });
      return false;
    }

    try {
      logger.info('Closing E2B sandbox', {
        correlationId: this.correlationId,
        sessionId,
        sandboxId: metadata.sessionId,
        workflowId: metadata.workflowId
      });

      // Close the sandbox
      await sandbox.kill();

      // Update metadata
      metadata.status = 'terminated';
      
      // Remove from active sessions
      this.sessions.delete(sessionId);
      this.sessionMetadata.delete(sessionId);

      logger.info('E2B sandbox closed successfully', {
        correlationId: this.correlationId,
        sessionId,
        remainingSessions: this.sessions.size
      });

      return true;

    } catch (error) {
      logger.error('Failed to close E2B sandbox', {
        correlationId: this.correlationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Still remove from our tracking even if close failed
      this.sessions.delete(sessionId);
      this.sessionMetadata.delete(sessionId);
      
      return false;
    }
  }

  async listSandboxes(): Promise<E2BSandboxSession[]> {
    return Array.from(this.sessionMetadata.values());
  }

  private startCleanupTimer(): void {
    const config = configManager.getConfig();
    const keepAliveMs = config.integrations.e2b.keepAliveMs;

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions(keepAliveMs);
    }, 5 * 60 * 1000);
  }

  private async cleanupIdleSessions(maxIdleMs: number): Promise<void> {
    const now = Date.now();
    const sessionsToClose: string[] = [];

    for (const [sessionId, metadata] of this.sessionMetadata.entries()) {
      const idleTime = now - metadata.lastActivity.getTime();
      if (idleTime > maxIdleMs) {
        sessionsToClose.push(sessionId);
      }
    }

    if (sessionsToClose.length > 0) {
      logger.info('Cleaning up idle E2B sessions', {
        correlationId: this.correlationId,
        sessionsToClose: sessionsToClose.length,
        maxIdleMs
      });

      for (const sessionId of sessionsToClose) {
        await this.closeSandbox(sessionId);
      }
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', details: any }> {
    const details: any = {
      initialized: this.initialized,
      activeSessions: this.sessions.size,
      timestamp: new Date().toISOString()
    };

    try {
      const config = configManager.getConfig();
      details.hasApiKey = !!config.integrations.e2b?.apiKey;
      details.maxSessions = config.integrations.e2b?.maxSessions;
      
      logger.info('E2B health check passed', {
        correlationId: this.correlationId,
        details
      });

      return { status: 'healthy', details };

    } catch (error) {
      details.error = error instanceof Error ? error.message : String(error);
      
      logger.warn('E2B health check failed', {
        correlationId: this.correlationId,
        details
      });

      return { status: 'unhealthy', details };
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up E2B service', {
      correlationId: this.correlationId,
      activeSessions: this.sessions.size
    });

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all active sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.closeSandbox(sessionId);
    }

    this.sessions.clear();
    this.sessionMetadata.clear();
    this.initialized = false;

    logger.info('E2B service cleanup complete', {
      correlationId: this.correlationId
    });
  }
}

// Factory function for creating service instances
export function createE2BService(correlationId?: string): E2BService {
  return new E2BService(correlationId);
}