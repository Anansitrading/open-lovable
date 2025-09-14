import { z } from 'zod';
import { logger } from '../core/logger.js';
import { sandboxManager } from '../managers/sandbox-manager.js';
import { LoveChildError } from '../types/index.js';

export const DeployToolSchema = z.object({
  workflowId: z.string().describe("Workflow ID with generated code to deploy"),
  projectName: z.string().optional().default('lovable-project').describe("Project name in sandbox"),
  port: z.number().optional().default(3000).describe("Port to serve the application on"),
  installDependencies: z.boolean().default(true).describe("Whether to install npm dependencies"),
  startDevServer: z.boolean().default(true).describe("Whether to start the development server"),
  createPreview: z.boolean().default(true).describe("Whether to create a preview URL")
});

export type DeployToolInput = z.infer<typeof DeployToolSchema>;

export interface DeployToolResult {
  success: boolean;
  workflowId: string;
  sandbox?: {
    sessionId: string;
    status: string;
    projectName: string;
  };
  deployment?: {
    filesDeployed: number;
    dependenciesInstalled: string[];
    devDependenciesInstalled: string[];
    commands: string[];
  };
  preview?: {
    url: string;
    port: number;
    protocol: string;
    status: string;
  };
  message: string;
  details?: any;
}

/**
 * Deploy Tool - Deploy AI-generated code to E2B sandboxes with live preview
 */
export async function deployTool(
  input: DeployToolInput,
  correlationId: string
): Promise<DeployToolResult> {
  const timer = logger.startTimer('deploy-tool');
  
  try {
    logger.info('Processing deployment request', {
      correlationId,
      workflowId: input.workflowId,
      projectName: input.projectName,
      port: input.port,
      installDependencies: input.installDependencies,
      startDevServer: input.startDevServer,
      createPreview: input.createPreview
    });

    // Get workflow state to retrieve generated code
    const workflowState = global.workflowState?.get?.(input.workflowId);
    if (!workflowState) {
      const executionTime = timer();
      return {
        success: false,
        workflowId: input.workflowId,
        message: `No workflow found with ID ${input.workflowId}. Please run 'specify' and 'generate' first.`,
        details: { executionTime }
      };
    }

    const generatedCode = workflowState.generatedCode;
    if (!generatedCode) {
      const executionTime = timer();
      return {
        success: false,
        workflowId: input.workflowId,
        message: `No generated code found for workflow ${input.workflowId}. Please run 'generate' first.`,
        details: { executionTime }
      };
    }

    // Get or create sandbox for the workflow
    let sandbox = await sandboxManager.getSandboxForWorkflow(input.workflowId);
    
    if (!sandbox) {
      logger.info('Creating new sandbox for deployment', {
        correlationId,
        workflowId: input.workflowId
      });
      
      sandbox = await sandboxManager.createSandboxForWorkflow(input.workflowId, {
        template: 'nodejs',
        workflowId: input.workflowId
      });
    }

    const result: DeployToolResult = {
      success: true,
      workflowId: input.workflowId,
      sandbox: {
        sessionId: sandbox.id,
        status: sandbox.status,
        projectName: input.projectName
      },
      message: `Deployment started for ${generatedCode.files.length} files.`
    };

    // Initialize React project if needed
    const hasProjectFiles = sandbox.files.some(f => f.includes('package.json'));
    if (!hasProjectFiles) {
      logger.info('Initializing React project in sandbox', {
        correlationId,
        workflowId: input.workflowId,
        sessionId: sandbox.id
      });

      const initResults = await sandboxManager.initializeReactProject(
        sandbox.id,
        input.projectName
      );

      const allSuccessful = initResults.every(r => r.success);
      if (!allSuccessful) {
        const failedSteps = initResults.filter(r => !r.success);
        const executionTime = timer();
        return {
          success: false,
          workflowId: input.workflowId,
          message: `Failed to initialize React project: ${failedSteps.map(s => s.error).join(', ')}`,
          details: { 
            initResults: initResults.map(r => ({
              command: r.command,
              success: r.success,
              error: r.error
            })),
            executionTime 
          }
        };
      }
    }

    // Deploy generated files
    logger.info('Deploying generated files to sandbox', {
      correlationId,
      workflowId: input.workflowId,
      sessionId: sandbox.id,
      fileCount: generatedCode.files.length
    });

    const fileOperations = await sandboxManager.writeProjectFiles(
      sandbox.id,
      generatedCode.files,
      input.projectName
    );

    result.deployment = {
      filesDeployed: fileOperations.filter(op => op.type === 'write').length,
      dependenciesInstalled: [],
      devDependenciesInstalled: [],
      commands: generatedCode.commands || []
    };

    // Install dependencies if requested
    if (input.installDependencies && (generatedCode.dependencies.length > 0 || generatedCode.devDependencies.length > 0)) {
      logger.info('Installing dependencies in sandbox', {
        correlationId,
        workflowId: input.workflowId,
        sessionId: sandbox.id,
        dependencies: generatedCode.dependencies.length,
        devDependencies: generatedCode.devDependencies.length
      });

      // Install regular dependencies
      if (generatedCode.dependencies.length > 0) {
        const depsResult = await sandboxManager.installPackages(
          sandbox.id,
          generatedCode.dependencies,
          input.projectName,
          false
        );

        if (depsResult.success) {
          result.deployment.dependenciesInstalled = generatedCode.dependencies;
        } else {
          logger.warn('Dependency installation had issues', {
            correlationId,
            workflowId: input.workflowId,
            error: depsResult.error
          });
        }
      }

      // Install dev dependencies
      if (generatedCode.devDependencies.length > 0) {
        const devDepsResult = await sandboxManager.installPackages(
          sandbox.id,
          generatedCode.devDependencies,
          input.projectName,
          true
        );

        if (devDepsResult.success) {
          result.deployment.devDependenciesInstalled = generatedCode.devDependencies;
        } else {
          logger.warn('Dev dependency installation had issues', {
            correlationId,
            workflowId: input.workflowId,
            error: devDepsResult.error
          });
        }
      }
    }

    // Start development server if requested
    if (input.startDevServer) {
      logger.info('Starting development server', {
        correlationId,
        workflowId: input.workflowId,
        sessionId: sandbox.id,
        port: input.port
      });

      const devServerResult = await sandboxManager.startDevServer(
        sandbox.id,
        input.projectName,
        input.port
      );

      if (!devServerResult.success) {
        logger.warn('Development server start had issues', {
          correlationId,
          workflowId: input.workflowId,
          error: devServerResult.error
        });
        // Continue anyway, as the server might still be running
      }
    }

    // Create preview URL if requested
    if (input.createPreview) {
      logger.info('Creating preview URL', {
        correlationId,
        workflowId: input.workflowId,
        sessionId: sandbox.id,
        port: input.port
      });

      const previewInfo = await sandboxManager.getPreviewUrl(sandbox.id, input.port);
      
      if (previewInfo) {
        result.preview = {
          url: previewInfo.url,
          port: previewInfo.port,
          protocol: previewInfo.protocol,
          status: previewInfo.status
        };
        
        result.message = `Deployment successful! ${result.deployment.filesDeployed} files deployed. Preview available at: ${previewInfo.url}`;
      } else {
        result.message = `Deployment successful! ${result.deployment.filesDeployed} files deployed. Preview URL generation failed.`;
      }
    } else {
      result.message = `Deployment successful! ${result.deployment.filesDeployed} files deployed to sandbox.`;
    }

    // Update workflow state with deployment info
    workflowState.sandbox = {
      sandboxId: sandbox.id,
      url: result.preview?.url || '',
      provider: 'e2b' as const,
      createdAt: new Date(),
      status: 'running' as const
    };
    global.workflowState?.set(input.workflowId, workflowState);

    const executionTime = timer();
    result.details = {
      executionTime,
      sandboxId: sandbox.id,
      projectPath: input.projectName,
      totalOperations: fileOperations.length
    };

    logger.info('Deployment completed successfully', {
      correlationId,
      workflowId: input.workflowId,
      sessionId: sandbox.id,
      filesDeployed: result.deployment.filesDeployed,
      previewUrl: result.preview?.url,
      executionTime
    });

    return result;

  } catch (error) {
    const executionTime = timer();
    logger.error('Deployment failed', {
      correlationId,
      workflowId: input.workflowId,
      executionTime,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      workflowId: input.workflowId,
      message: `Deployment failed: ${error instanceof Error ? error.message : String(error)}`,
      details: {
        projectName: input.projectName,
        port: input.port,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}