import { ToolDefinition, ToolContext } from '../../core/tool-registry.js';
import { StatusToolSchema, StatusInput, StatusResponse } from '../../types/index.js';

export const StatusTool: ToolDefinition = {
  name: 'status',
  description: 'Display comprehensive workflow status including progress, artifacts, and next steps for SpecKit development lifecycle.',
  schema: StatusToolSchema,
  handler: async (args: StatusInput, context: ToolContext): Promise<StatusResponse> => {
    const { verbose } = args;
    const { correlationId, workflowManager, logger: contextLogger } = context;
    
    contextLogger.info('Starting status tool execution', {
      correlationId,
      verbose
    });

    try {
      // Get current workflow status
      const workflow = await workflowManager.getCurrentWorkflow();
      const workflowStatus = await workflowManager.getStatus();
      
      // Calculate progress metrics
      const progressMetrics = calculateProgress(workflow, workflowStatus);
      
      // Get recent activity (mock for now)
      const recentActivity = await getRecentActivity(workflowManager);
      
      // Check file health
      const fileHealth = await checkFileHealth(workflowManager);
      
      // Generate status report
      const statusData = {
        workflowState: workflow || {
          id: 'none',
          phase: 'none' as const,
          artifacts: {},
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 0
          }
        },
        sandboxStatus: workflow?.sandbox || null,
        recentActivity,
        progress: progressMetrics,
        fileHealth,
        nextSteps: generateNextSteps(workflow),
        verbose: verbose ? getVerboseInfo(workflow, workflowStatus) : undefined
      };

      contextLogger.info('Status report generated successfully', {
        correlationId,
        hasWorkflow: !!workflow,
        phase: workflow?.phase || 'none',
        progress: progressMetrics.percentage,
        artifactCount: Object.keys(workflow?.artifacts || {}).length
      });

      return {
        success: true,
        data: statusData,
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Status tool execution failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};

function calculateProgress(workflow: any, workflowStatus: any) {
  if (!workflow) {
    return {
      percentage: 0,
      phase: 'Not Started',
      phasesCompleted: 0,
      totalPhases: 5,
      artifactsPresent: 0,
      totalArtifacts: 3
    };
  }

  const phaseOrder = ['specification', 'planning', 'tasks', 'implementation', 'complete'];
  const currentPhaseIndex = phaseOrder.indexOf(workflow.phase);
  
  const artifactsPresent = Object.keys(workflow.artifacts || {}).filter(key => 
    workflow.artifacts[key] !== null && workflow.artifacts[key] !== undefined
  ).length;
  
  const totalArtifacts = 3; // spec, plan, tasks
  
  let percentage = 0;
  if (currentPhaseIndex >= 0) {
    percentage = Math.round(((currentPhaseIndex + 1) / phaseOrder.length) * 100);
  }
  
  return {
    percentage,
    phase: formatPhaseName(workflow.phase),
    phasesCompleted: Math.max(0, currentPhaseIndex),
    totalPhases: phaseOrder.length,
    artifactsPresent,
    totalArtifacts
  };
}

function formatPhaseName(phase: string): string {
  switch (phase) {
    case 'specification': return 'Specification';
    case 'planning': return 'Planning';
    case 'tasks': return 'Task Breakdown';
    case 'implementation': return 'Implementation';
    case 'complete': return 'Complete';
    default: return 'Unknown';
  }
}

async function getRecentActivity(workflowManager: any) {
  // This would ideally read from a log file or activity tracker
  // For now, return mock recent activity
  const activities = [];
  
  try {
    const workflow = await workflowManager.getCurrentWorkflow();
    if (workflow) {
      activities.push({
        timestamp: workflow.metadata.updatedAt,
        action: `Workflow ${workflow.phase}`,
        details: `Current phase: ${formatPhaseName(workflow.phase)}`
      });
      
      if (workflow.artifacts.spec) {
        activities.push({
          timestamp: workflow.metadata.updatedAt,
          action: 'Specification Created',
          details: workflow.artifacts.spec.title
        });
      }
      
      if (workflow.artifacts.plan) {
        activities.push({
          timestamp: workflow.metadata.updatedAt,
          action: 'Plan Generated',
          details: `${workflow.artifacts.plan.milestones?.length || 0} milestones planned`
        });
      }
      
      if (workflow.artifacts.tasks) {
        activities.push({
          timestamp: workflow.metadata.updatedAt,
          action: 'Tasks Created',
          details: `${workflow.artifacts.tasks.length} tasks defined`
        });
      }
    }
  } catch (error) {
    // Ignore errors in activity retrieval
  }
  
  // Sort by timestamp descending and limit to 5
  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);
}

async function checkFileHealth(workflowManager: any) {
  const files = ['spec.md', 'plan.md', 'tasks.md'];
  const health = {
    totalFiles: files.length,
    existingFiles: 0,
    missingFiles: [] as string[],
    files: {} as Record<string, { exists: boolean; size?: number; lastModified?: Date }>
  };
  
  for (const file of files) {
    try {
      const exists = await workflowManager.fileExists(file);
      health.files[file] = { exists };
      
      if (exists) {
        health.existingFiles++;
        // Could add size and last modified info here
      } else {
        health.missingFiles.push(file);
      }
    } catch (error) {
      health.files[file] = { exists: false };
      health.missingFiles.push(file);
    }
  }
  
  return health;
}

function generateNextSteps(workflow: any): string[] {
  if (!workflow) {
    return [
      'Run /specify to create a project specification',
      'Provide a project description or URL to scrape for context',
      'Begin your SpecKit-driven development workflow'
    ];
  }
  
  switch (workflow.phase) {
    case 'specification':
      return [
        'Run /plan to create a technical implementation plan',
        'Specify your technology stack and architecture preferences',
        'Consider any additional features or constraints'
      ];
      
    case 'planning':
      return [
        'Run /tasks to break down the plan into executable tasks',
        'Choose granularity level (high/medium/detailed)',
        'Specify priority focus (feature/performance/polish)'
      ];
      
    case 'tasks':
      return [
        'Begin implementation following the task breakdown',
        'Run /generate to create AI-powered code components',
        'Use /preview to create live sandbox previews'
      ];
      
    case 'implementation':
      return [
        'Continue development based on task list',
        'Use /iterate for conversational refinements',
        'Test and validate implementation progress'
      ];
      
    case 'complete':
      return [
        'Project workflow is complete!',
        'Consider running /iterate for further improvements',
        'Start a new workflow with /specify for your next project'
      ];
      
    default:
      return [
        'Unknown workflow phase',
        'Run /status --verbose for more details',
        'Consider restarting with /specify'
      ];
  }
}

function getVerboseInfo(workflow: any, workflowStatus: any) {
  const info: any = {
    workflowDetails: null,
    artifacts: {},
    fileSystem: {},
    performance: {}
  };
  
  if (workflow) {
    info.workflowDetails = {
      id: workflow.id,
      phase: workflow.phase,
      version: workflow.metadata.version,
      created: workflow.metadata.createdAt,
      lastUpdated: workflow.metadata.updatedAt,
      lastCommand: workflow.metadata.lastCommand
    };
    
    // Artifact details
    if (workflow.artifacts.spec) {
      info.artifacts.specification = {
        title: workflow.artifacts.spec.title,
        requirementsCount: workflow.artifacts.spec.requirements?.length || 0,
        constraintsCount: workflow.artifacts.spec.constraints?.length || 0,
        hasScrapedContext: !!workflow.artifacts.spec.scrapedContext,
        technology: workflow.artifacts.spec.technology,
        style: workflow.artifacts.spec.style
      };
    }
    
    if (workflow.artifacts.plan) {
      info.artifacts.plan = {
        architecture: workflow.artifacts.plan.architecture,
        techStackSize: workflow.artifacts.plan.techStack?.length || 0,
        featuresCount: workflow.artifacts.plan.features?.length || 0,
        milestonesCount: workflow.artifacts.plan.milestones?.length || 0,
        risksCount: workflow.artifacts.plan.risks?.length || 0,
        totalEstimatedHours: workflow.artifacts.plan.milestones?.reduce(
          (sum: number, m: any) => sum + (m.estimatedHours || 0), 0
        ) || 0
      };
    }
    
    if (workflow.artifacts.tasks) {
      const tasks = workflow.artifacts.tasks;
      info.artifacts.tasks = {
        totalTasks: tasks.length,
        pendingTasks: tasks.filter((t: any) => t.status === 'pending').length,
        inProgressTasks: tasks.filter((t: any) => t.status === 'in-progress').length,
        completeTasks: tasks.filter((t: any) => t.status === 'complete').length,
        highPriorityTasks: tasks.filter((t: any) => t.priority === 'high').length,
        totalEstimatedHours: tasks.reduce((sum: number, t: any) => sum + (t.estimatedHours || 0), 0)
      };
    }
    
    // Sandbox info
    if (workflow.sandbox) {
      info.sandbox = {
        id: workflow.sandbox.sandboxId,
        provider: workflow.sandbox.provider,
        status: workflow.sandbox.status,
        url: workflow.sandbox.url,
        created: workflow.sandbox.createdAt
      };
    }
  }
  
  return info;
}