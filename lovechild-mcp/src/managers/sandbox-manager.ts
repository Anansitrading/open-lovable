import { logger } from '../core/logger.js';
import { E2BService, createE2BService } from '../integrations/e2b-service.js';
import { 
  LoveChildError, 
  E2BSandboxSession, 
  E2BFileOperation, 
  E2BCommandExecution, 
  E2BExecutionResult, 
  E2BSandboxOptions, 
  E2BPreviewInfo,
  WorkflowState
} from '../types/index.js';

/**
 * Singleton E2B sandbox manager for coordinating sandbox lifecycle,
 * state synchronization, and resource management across MCP workflows.
 */
export class E2BSandboxManager {
  private static instance: E2BSandboxManager;
  private e2bService: E2BService;
  private workflowSessions = new Map<string, string>(); // workflowId -> sessionId
  private initialized = false;

  private constructor() {
    this.e2bService = createE2BService('sandbox-manager');
  }

  /**
   * Get the singleton instance of E2BSandboxManager
   */
  static getInstance(): E2BSandboxManager {
    if (!E2BSandboxManager.instance) {
      E2BSandboxManager.instance = new E2BSandboxManager();
    }
    return E2BSandboxManager.instance;
  }

  /**
   * Initialize the sandbox manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Perform health check on the E2B service
      const healthResult = await this.e2bService.healthCheck();
      
      if (healthResult.status === 'unhealthy') {
        throw new LoveChildError(
          'E2B service is not healthy',
          'E2B_SERVICE_UNHEALTHY',
          healthResult.details
        );
      }

      this.initialized = true;

      logger.info('E2B sandbox manager initialized', {
        correlationId: 'sandbox-manager',
        serviceHealth: healthResult.status,
        details: healthResult.details
      });

    } catch (error) {
      logger.error('Failed to initialize E2B sandbox manager', {
        correlationId: 'sandbox-manager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Create a new sandbox for a specific workflow
   */
  async createSandboxForWorkflow(workflowId: string, options: E2BSandboxOptions = {}): Promise<E2BSandboxSession> {
    await this.initialize();

    // Check if workflow already has a sandbox
    const existingSessionId = this.workflowSessions.get(workflowId);
    if (existingSessionId) {
      const existingSession = await this.e2bService.getSandbox(existingSessionId);
      if (existingSession && existingSession.status === 'active') {
        logger.info('Returning existing sandbox for workflow', {
          correlationId: 'sandbox-manager',
          workflowId,
          sessionId: existingSessionId
        });
        return existingSession;
      } else {
        // Clean up stale reference
        this.workflowSessions.delete(workflowId);
      }
    }

    try {
      logger.info('Creating new sandbox for workflow', {
        correlationId: 'sandbox-manager',
        workflowId,
        options
      });

      // Create the sandbox with workflow context
      const sandboxOptions: E2BSandboxOptions = {
        ...options,
        workflowId
      };

      const session = await this.e2bService.createSandbox(sandboxOptions);
      
      // Track the workflow-session relationship
      this.workflowSessions.set(workflowId, session.id);

      logger.info('Sandbox created for workflow', {
        correlationId: 'sandbox-manager',
        workflowId,
        sessionId: session.id,
        sandboxId: session.sessionId
      });

      return session;

    } catch (error) {
      logger.error('Failed to create sandbox for workflow', {
        correlationId: 'sandbox-manager',
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get the sandbox session for a workflow
   */
  async getSandboxForWorkflow(workflowId: string): Promise<E2BSandboxSession | null> {
    const sessionId = this.workflowSessions.get(workflowId);
    if (!sessionId) {
      return null;
    }

    const session = await this.e2bService.getSandbox(sessionId);
    if (!session || session.status !== 'active') {
      // Clean up stale reference
      this.workflowSessions.delete(workflowId);
      return null;
    }

    return session;
  }

  /**
   * Initialize a React/Vite project in the sandbox
   */
  async initializeReactProject(sessionId: string, projectName: string = 'lovable-project'): Promise<E2BExecutionResult[]> {
    const timer = logger.startTimer('initialize-react-project');
    const results: E2BExecutionResult[] = [];

    try {
      logger.info('Initializing React project in sandbox', {
        correlationId: 'sandbox-manager',
        sessionId,
        projectName
      });

      // Step 1: Create Vite React project
      const createResult = await this.e2bService.executeCommand(sessionId, {
        command: `npm create vite@latest ${projectName} -- --template react-ts`,
        timeout: 60000
      });
      results.push(createResult);

      if (!createResult.success) {
        throw new LoveChildError(
          `Failed to create Vite project: ${createResult.error}`,
          'VITE_CREATE_FAILED'
        );
      }

      // Step 2: Navigate to project directory and install dependencies
      const installResult = await this.e2bService.executeCommand(sessionId, {
        command: `cd ${projectName} && npm install`,
        timeout: 120000
      });
      results.push(installResult);

      if (!installResult.success) {
        throw new LoveChildError(
          `Failed to install dependencies: ${installResult.error}`,
          'NPM_INSTALL_FAILED'
        );
      }

      // Step 3: Install Tailwind CSS
      const tailwindInstallResult = await this.e2bService.executeCommand(sessionId, {
        command: `cd ${projectName} && npm install -D tailwindcss postcss autoprefixer`,
        timeout: 60000
      });
      results.push(tailwindInstallResult);

      // Step 4: Initialize Tailwind config
      const tailwindInitResult = await this.e2bService.executeCommand(sessionId, {
        command: `cd ${projectName} && npx tailwindcss init -p`,
        timeout: 30000
      });
      results.push(tailwindInitResult);

      // Step 5: Update Tailwind config
      const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

      await this.e2bService.writeFiles(sessionId, [
        { path: `${projectName}/tailwind.config.js`, content: tailwindConfig }
      ]);

      // Step 6: Update CSS with Tailwind directives
      const tailwindCSS = `@tailwind base;
@tailwind components;
@tailwind utilities;`;

      await this.e2bService.writeFiles(sessionId, [
        { path: `${projectName}/src/index.css`, content: tailwindCSS }
      ]);

      const executionTime = timer();
      logger.info('React project initialized successfully', {
        correlationId: 'sandbox-manager',
        sessionId,
        projectName,
        executionTime,
        steps: results.length,
        allSuccessful: results.every(r => r.success)
      });

      return results;

    } catch (error) {
      const executionTime = timer();
      logger.error('Failed to initialize React project', {
        correlationId: 'sandbox-manager',
        sessionId,
        projectName,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Start the development server for the React project
   */
  async startDevServer(sessionId: string, projectName: string = 'lovable-project', port: number = 3000): Promise<E2BExecutionResult> {
    try {
      logger.info('Starting development server', {
        correlationId: 'sandbox-manager',
        sessionId,
        projectName,
        port
      });

      // Start the Vite dev server with custom port
      const result = await this.e2bService.executeCommand(sessionId, {
        command: `cd ${projectName} && npm run dev -- --host 0.0.0.0 --port ${port}`,
        timeout: 15000, // Give it time to start
        background: true // This would need to be implemented in the E2B service
      });

      if (result.success) {
        logger.info('Development server started', {
          correlationId: 'sandbox-manager',
          sessionId,
          port,
          duration: result.duration
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to start development server', {
        correlationId: 'sandbox-manager',
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Write multiple files to a sandbox and update the project structure
   */
  async writeProjectFiles(
    sessionId: string, 
    files: Array<{ path: string; content: string }>,
    projectName: string = 'lovable-project'
  ): Promise<E2BFileOperation[]> {
    try {
      // Prepend project directory to all file paths
      const projectFiles = files.map(file => ({
        ...file,
        path: file.path.startsWith(projectName) ? file.path : `${projectName}/${file.path}`
      }));

      logger.info('Writing project files to sandbox', {
        correlationId: 'sandbox-manager',
        sessionId,
        projectName,
        fileCount: projectFiles.length,
        files: projectFiles.map(f => f.path)
      });

      const operations = await this.e2bService.writeFiles(sessionId, projectFiles);

      logger.info('Project files written successfully', {
        correlationId: 'sandbox-manager',
        sessionId,
        operationsCount: operations.length
      });

      return operations;

    } catch (error) {
      logger.error('Failed to write project files', {
        correlationId: 'sandbox-manager',
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Install npm packages in the project
   */
  async installPackages(
    sessionId: string, 
    packages: string[], 
    projectName: string = 'lovable-project',
    isDev: boolean = false
  ): Promise<E2BExecutionResult> {
    try {
      const packagesStr = packages.join(' ');
      const devFlag = isDev ? ' -D' : '';
      
      logger.info('Installing npm packages', {
        correlationId: 'sandbox-manager',
        sessionId,
        projectName,
        packages,
        isDev
      });

      const result = await this.e2bService.executeCommand(sessionId, {
        command: `cd ${projectName} && npm install${devFlag} ${packagesStr}`,
        timeout: 120000 // 2 minutes for package installation
      });

      if (result.success) {
        logger.info('Packages installed successfully', {
          correlationId: 'sandbox-manager',
          sessionId,
          packages,
          duration: result.duration
        });
      } else {
        logger.warn('Package installation had issues', {
          correlationId: 'sandbox-manager',
          sessionId,
          packages,
          error: result.error,
          stderr: result.stderr
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to install packages', {
        correlationId: 'sandbox-manager',
        sessionId,
        packages,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get preview URL for a sandbox
   */
  async getPreviewUrl(sessionId: string, port: number = 3000): Promise<E2BPreviewInfo | null> {
    try {
      const previewInfo = await this.e2bService.getPreviewInfo(sessionId, port);
      
      if (previewInfo) {
        logger.info('Preview URL retrieved', {
          correlationId: 'sandbox-manager',
          sessionId,
          url: previewInfo.url,
          port,
          status: previewInfo.status
        });
      }

      return previewInfo;

    } catch (error) {
      logger.error('Failed to get preview URL', {
        correlationId: 'sandbox-manager',
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Synchronize workflow state with sandbox session
   */
  async syncWorkflowState(workflowId: string, state: Partial<WorkflowState>): Promise<void> {
    const sessionId = this.workflowSessions.get(workflowId);
    if (!sessionId) {
      logger.warn('No sandbox session found for workflow', {
        correlationId: 'sandbox-manager',
        workflowId
      });
      return;
    }

    try {
      const session = await this.e2bService.getSandbox(sessionId);
      if (!session) {
        logger.warn('Sandbox session not found during state sync', {
          correlationId: 'sandbox-manager',
          workflowId,
          sessionId
        });
        this.workflowSessions.delete(workflowId);
        return;
      }

      // Update session metadata with workflow state
      if (state.currentStep) {
        session.metadata.currentStep = state.currentStep;
      }
      if (state.projectType && ['react', 'vite', 'node', 'python'].includes(state.projectType)) {
        session.metadata.projectType = state.projectType as 'react' | 'vite' | 'node' | 'python';
      }
      if (state.status) {
        session.metadata.workflowStatus = state.status;
      }

      logger.debug('Workflow state synchronized', {
        correlationId: 'sandbox-manager',
        workflowId,
        sessionId,
        syncedFields: Object.keys(state)
      });

    } catch (error) {
      logger.error('Failed to sync workflow state', {
        correlationId: 'sandbox-manager',
        workflowId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Close sandbox for a workflow
   */
  async closeSandboxForWorkflow(workflowId: string): Promise<boolean> {
    const sessionId = this.workflowSessions.get(workflowId);
    if (!sessionId) {
      logger.warn('No sandbox session found for workflow to close', {
        correlationId: 'sandbox-manager',
        workflowId
      });
      return false;
    }

    try {
      logger.info('Closing sandbox for workflow', {
        correlationId: 'sandbox-manager',
        workflowId,
        sessionId
      });

      const result = await this.e2bService.closeSandbox(sessionId);
      
      // Remove workflow tracking regardless of close result
      this.workflowSessions.delete(workflowId);

      logger.info('Sandbox closed for workflow', {
        correlationId: 'sandbox-manager',
        workflowId,
        sessionId,
        success: result
      });

      return result;

    } catch (error) {
      logger.error('Failed to close sandbox for workflow', {
        correlationId: 'sandbox-manager',
        workflowId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Still remove tracking on error
      this.workflowSessions.delete(workflowId);
      return false;
    }
  }

  /**
   * List all active sandboxes
   */
  async listActiveSandboxes(): Promise<E2BSandboxSession[]> {
    return await this.e2bService.listSandboxes();
  }

  /**
   * Get sandbox manager health status
   */
  async getHealthStatus(): Promise<{ status: 'healthy' | 'unhealthy', details: any }> {
    const serviceHealth = await this.e2bService.healthCheck();
    
    const details = {
      ...serviceHealth.details,
      workflowSessions: this.workflowSessions.size,
      initialized: this.initialized
    };

    return {
      status: serviceHealth.status,
      details
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up sandbox manager', {
      correlationId: 'sandbox-manager',
      workflowSessions: this.workflowSessions.size
    });

    // Close all workflow sandboxes
    const workflowIds = Array.from(this.workflowSessions.keys());
    for (const workflowId of workflowIds) {
      await this.closeSandboxForWorkflow(workflowId);
    }

    // Cleanup the E2B service
    await this.e2bService.cleanup();

    this.workflowSessions.clear();
    this.initialized = false;

    logger.info('Sandbox manager cleanup complete', {
      correlationId: 'sandbox-manager'
    });
  }
}

// Export the singleton instance getter
export const sandboxManager = E2BSandboxManager.getInstance();