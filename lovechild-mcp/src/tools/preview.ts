import { z } from 'zod';
import { logger } from '../core/logger.js';
import { sandboxManager } from '../managers/sandbox-manager.js';
import { LoveChildError } from '../types/index.js';

export const PreviewToolSchema = z.object({
  workflowId: z.string().describe("Workflow ID to get preview for"),
  projectName: z.string().optional().default('lovable-project').describe("Project name in sandbox"),
  port: z.number().optional().default(3000).describe("Port to serve the preview on"),
  action: z.enum(['create', 'get', 'refresh']).default('get').describe("Preview action to perform")
});

export type PreviewToolInput = z.infer<typeof PreviewToolSchema>;

export interface PreviewToolResult {
  success: boolean;
  previewUrl?: string;
  status?: string;
  port?: number;
  protocol?: string;
  workflowId: string;
  message: string;
  details?: any;
}

/**
 * E2B Preview Tool - Manage live previews of React/Vite projects in E2B sandboxes
 */
export async function previewTool(
  input: PreviewToolInput,
  correlationId: string
): Promise<PreviewToolResult> {
  const timer = logger.startTimer('preview-tool');
  
  try {
    logger.info('Processing preview request', {
      correlationId,
      workflowId: input.workflowId,
      action: input.action,
      projectName: input.projectName,
      port: input.port
    });

    // Get or create sandbox for the workflow
    let sandbox = await sandboxManager.getSandboxForWorkflow(input.workflowId);
    
    if (!sandbox) {
      if (input.action === 'get') {
        const executionTime = timer();
        return {
          success: false,
          workflowId: input.workflowId,
          message: 'No active sandbox found for workflow. Use action "create" to initialize a sandbox.',
          details: { executionTime }
        };
      }
      
      // Create new sandbox for preview
      sandbox = await sandboxManager.createSandboxForWorkflow(input.workflowId, {
        template: 'nodejs',
        workflowId: input.workflowId
      });
      
      logger.info('Created new sandbox for preview', {
        correlationId,
        workflowId: input.workflowId,
        sessionId: sandbox.id
      });
    }

    const sessionId = sandbox.id;

    // Handle different preview actions
    switch (input.action) {
      case 'create': {
        // Initialize React project if not already done
        const hasProjectFiles = sandbox.files.some(f => f.includes('package.json'));
        let initResults: any[] = [];
        
        if (!hasProjectFiles) {
          logger.info('Initializing React project for preview', {
            correlationId,
            workflowId: input.workflowId,
            sessionId,
            projectName: input.projectName
          });
          
          initResults = await sandboxManager.initializeReactProject(
            sessionId, 
            input.projectName
          );
          
          const allSuccessful = initResults.every(r => r.success);
          if (!allSuccessful) {
            const failedSteps = initResults.filter(r => !r.success);
            throw new LoveChildError(
              `Failed to initialize React project: ${failedSteps.map(s => s.error).join(', ')}`,
              'REACT_INIT_FAILED'
            );
          }
        }

        // Start development server
        const devServerResult = await sandboxManager.startDevServer(
          sessionId,
          input.projectName,
          input.port
        );

        if (!devServerResult.success) {
          logger.warn('Development server start had issues', {
            correlationId,
            sessionId,
            error: devServerResult.error,
            stderr: devServerResult.stderr
          });
          // Continue anyway, as the server might still be running
        }

        // Get preview URL
        const previewInfo = await sandboxManager.getPreviewUrl(sessionId, input.port);
        
        if (!previewInfo) {
          throw new LoveChildError(
            'Failed to get preview URL after initialization',
            'PREVIEW_URL_FAILED'
          );
        }

        const executionTime = timer();
        logger.info('Preview created successfully', {
          correlationId,
          workflowId: input.workflowId,
          previewUrl: previewInfo.url,
          executionTime
        });

        return {
          success: true,
          previewUrl: previewInfo.url,
          status: previewInfo.status,
          port: previewInfo.port,
          protocol: previewInfo.protocol,
          workflowId: input.workflowId,
          message: `Preview created successfully. React project initialized and dev server started on port ${input.port}.`,
          details: {
            projectName: input.projectName,
            initResults: initResults.map((r: any) => ({
              command: r.command,
              success: r.success,
              duration: r.duration
            })),
            devServerResult: {
              success: devServerResult.success,
              duration: devServerResult.duration
            },
            executionTime
          }
        };
      }

      case 'get': {
        // Get existing preview URL
        const previewInfo = await sandboxManager.getPreviewUrl(sessionId, input.port);
        
        if (!previewInfo) {
          const executionTime = timer();
          return {
            success: false,
            workflowId: input.workflowId,
            message: 'No preview URL available. Use action "create" to initialize a preview.',
            details: { sessionId, executionTime }
          };
        }

        const executionTime = timer();
        logger.info('Preview URL retrieved', {
          correlationId,
          workflowId: input.workflowId,
          previewUrl: previewInfo.url,
          executionTime
        });

        return {
          success: true,
          previewUrl: previewInfo.url,
          status: previewInfo.status,
          port: previewInfo.port,
          protocol: previewInfo.protocol,
          workflowId: input.workflowId,
          message: `Preview URL retrieved successfully.`,
          details: {
            sessionId,
            lastCheck: previewInfo.lastCheck,
            executionTime
          }
        };
      }

      case 'refresh': {
        // Restart development server to refresh the preview
        logger.info('Refreshing preview by restarting dev server', {
          correlationId,
          workflowId: input.workflowId,
          sessionId
        });

        // Stop any existing dev server (this may fail, that's OK)
        try {
          // Note: We can't directly access e2bService here, need to go through sandboxManager
          // This will be handled in the sandbox manager implementation
        } catch (error) {
          // Ignore errors when stopping server
          logger.debug('Error stopping existing dev server (this is OK)', {
            correlationId,
            sessionId,
            error: error instanceof Error ? error.message : String(error)
          });
        }

        // Start fresh dev server
        const devServerResult = await sandboxManager.startDevServer(
          sessionId,
          input.projectName,
          input.port
        );

        // Get updated preview URL
        const previewInfo = await sandboxManager.getPreviewUrl(sessionId, input.port);
        
        if (!previewInfo) {
          throw new LoveChildError(
            'Failed to get preview URL after refresh',
            'PREVIEW_REFRESH_FAILED'
          );
        }

        const executionTime = timer();
        logger.info('Preview refreshed successfully', {
          correlationId,
          workflowId: input.workflowId,
          previewUrl: previewInfo.url,
          executionTime
        });

        return {
          success: true,
          previewUrl: previewInfo.url,
          status: previewInfo.status,
          port: previewInfo.port,
          protocol: previewInfo.protocol,
          workflowId: input.workflowId,
          message: `Preview refreshed successfully. Development server restarted on port ${input.port}.`,
          details: {
            projectName: input.projectName,
            devServerResult: {
              success: devServerResult.success,
              duration: devServerResult.duration
            },
            executionTime
          }
        };
      }

      default: {
        throw new LoveChildError(
          `Unknown preview action: ${input.action}`,
          'INVALID_PREVIEW_ACTION'
        );
      }
    }

  } catch (error) {
    const executionTime = timer();
    logger.error('Preview tool failed', {
      correlationId,
      workflowId: input.workflowId,
      action: input.action,
      executionTime,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      workflowId: input.workflowId,
      message: `Preview ${input.action} failed: ${error instanceof Error ? error.message : String(error)}`,
      details: {
        action: input.action,
        projectName: input.projectName,
        port: input.port,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
