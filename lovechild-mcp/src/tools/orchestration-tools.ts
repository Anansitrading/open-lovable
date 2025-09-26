import { ToolDefinition, ToolContext } from '../core/tool-registry.js';
import { z } from 'zod';
import { mcpOrchestrator } from '../integrations/mcp-orchestrator.js';
import { logger } from '../core/logger.js';

// Schema definitions for orchestration tools
const RouteTaskSchema = z.object({
  task_type: z.string().describe('Type of task (research, code_generation, bug_report, etc.)'),
  description: z.string().describe('Description of the task to route'),
  complexity: z.enum(['low', 'medium', 'high']).optional().describe('Task complexity level'),
  context_required: z.boolean().optional().describe('Whether the task requires codebase context'),
  target: z.string().optional().describe('Target platform or system'),
  metadata: z.record(z.any()).optional().describe('Additional task metadata')
});

const ExecuteWorkflowSchema = z.object({
  workflow_name: z.string().describe('Name of the workflow to execute'),
  description: z.string().describe('Description of what needs to be accomplished'),
  library: z.string().optional().describe('Library or technology involved'),
  codebase: z.string().optional().describe('Codebase or repository context'),
  issue_title: z.string().optional().describe('Title for any issues to be created'),
  metadata: z.record(z.any()).optional().describe('Additional workflow context')
});

const ListMCPsSchema = z.object({
  capability_filter: z.string().optional().describe('Filter MCPs by capability (research, deployment, etc.)')
});

const GetRoutingRulesSchema = z.object({
  task_type: z.string().optional().describe('Filter rules by task type')
});

// Route Task Tool - Intelligently route a task to the appropriate MCP
export const RouteTaskTool: ToolDefinition = {
  name: 'route_task',
  description: 'Intelligently route a task to the most appropriate MCP server and tool based on task type, complexity, and requirements',
  schema: RouteTaskSchema,
  handler: async (args: z.infer<typeof RouteTaskSchema>, context: ToolContext) => {
    const { correlationId, logger: contextLogger } = context;
    
    contextLogger.info('Routing task through MCP orchestrator', {
      correlationId,
      taskType: args.task_type,
      complexity: args.complexity
    });

    try {
      const taskContext = {
        task_type: args.task_type,
        complexity: args.complexity,
        context_required: args.context_required,
        target: args.target,
        description: args.description,
        metadata: args.metadata,
        correlationId
      };

      const payload = {
        description: args.description,
        metadata: args.metadata,
        correlationId
      };

      const result = await mcpOrchestrator.routeTask(taskContext, payload);

      if (result.success) {
        contextLogger.info('Task routed successfully', {
          correlationId,
          mcpServer: result.mcp_server,
          tool: result.tool,
          executionTime: result.executionTime
        });

        return {
          success: true,
          data: {
            routed_to: {
              mcp_server: result.mcp_server,
              tool: result.tool
            },
            result: result.data,
            execution_time_ms: result.executionTime,
            routing_explanation: `Task '${args.task_type}' was routed to ${result.mcp_server}.${result.tool} based on complexity: ${args.complexity || 'auto-detected'}`
          },
          metadata: {
            executionTime: result.executionTime || 0,
            timestamp: new Date(),
            version: '1.0.0'
          }
        };
      } else {
        return {
          success: false,
          error: result.error,
          metadata: {
            executionTime: result.executionTime || 0,
            timestamp: new Date(),
            version: '1.0.0'
          }
        };
      }

    } catch (error) {
      contextLogger.error('Task routing failed', { correlationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};

// Execute Workflow Tool - Execute predefined multi-step workflows
export const ExecuteWorkflowTool: ToolDefinition = {
  name: 'execute_workflow',
  description: 'Execute a complete multi-step workflow that coordinates multiple MCPs (feature_development, bug_fix, research_implement)',
  schema: ExecuteWorkflowSchema,
  handler: async (args: z.infer<typeof ExecuteWorkflowSchema>, context: ToolContext) => {
    const { correlationId, logger: contextLogger } = context;
    
    contextLogger.info('Executing workflow', {
      correlationId,
      workflowName: args.workflow_name
    });

    try {
      const payload = {
        description: args.description,
        library: args.library,
        codebase: args.codebase,
        issue_title: args.issue_title,
        metadata: args.metadata,
        correlationId
      };

      const workflowResult = await mcpOrchestrator.executeWorkflow(args.workflow_name, payload);

      contextLogger.info('Workflow execution completed', {
        correlationId,
        workflowId: workflowResult.workflowId,
        success: workflowResult.success,
        stepsExecuted: workflowResult.results.length
      });

      return {
        success: workflowResult.success,
        data: {
          workflow_id: workflowResult.workflowId,
          workflow_name: args.workflow_name,
          steps_executed: workflowResult.results.length,
          successful_steps: workflowResult.results.filter(r => r.success).length,
          failed_steps: workflowResult.results.filter(r => !r.success).length,
          results: workflowResult.results.map(result => ({
            mcp_server: result.mcp_server,
            tool: result.tool,
            success: result.success,
            execution_time_ms: result.executionTime,
            error: result.error,
            data: result.success ? result.data : undefined
          })),
          summary: workflowResult.success 
            ? `Workflow '${args.workflow_name}' completed successfully with ${workflowResult.results.length} steps`
            : `Workflow '${args.workflow_name}' failed after ${workflowResult.results.length} steps`
        },
        metadata: {
          executionTime: workflowResult.results.reduce((sum, r) => sum + (r.executionTime || 0), 0),
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Workflow execution failed', { correlationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};

// List Available MCPs Tool - Get information about available MCP servers and capabilities
export const ListMCPsTool: ToolDefinition = {
  name: 'list_available_mcps',
  description: 'List all available MCP servers, their capabilities, and tools for orchestration planning',
  schema: ListMCPsSchema,
  handler: async (args: z.infer<typeof ListMCPsSchema>, context: ToolContext) => {
    const { correlationId, logger: contextLogger } = context;
    
    contextLogger.info('Listing available MCPs', {
      correlationId,
      capabilityFilter: args.capability_filter
    });

    try {
      const availableMCPs = mcpOrchestrator.getAvailableMCPs();
      
      // Filter by capability if requested
      const filteredMCPs = args.capability_filter 
        ? Object.entries(availableMCPs).filter(([_, server]) => 
            server.capabilities.includes(args.capability_filter!))
        : Object.entries(availableMCPs);

      const mcpSummary = filteredMCPs.map(([id, server]) => ({
        id,
        name: server.name,
        description: server.description,
        capabilities: server.capabilities,
        endpoint_type: server.endpoint.type,
        tools: Object.keys(server.tools),
        tool_details: Object.entries(server.tools).map(([toolName, toolInfo]) => ({
          name: toolName,
          description: toolInfo.description,
          use_cases: toolInfo.use_cases
        })),
        models: server.models ? Object.keys(server.models) : undefined
      }));

      return {
        success: true,
        data: {
          total_mcps: mcpSummary.length,
          filtered_by: args.capability_filter || 'none',
          mcps: mcpSummary,
          capability_summary: [...new Set(filteredMCPs.flatMap(([_, server]) => server.capabilities))],
          total_tools: mcpSummary.reduce((sum, mcp) => sum + mcp.tools.length, 0)
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Failed to list MCPs', { correlationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};

// Get Routing Rules Tool - Show how tasks are routed to different MCPs
export const GetRoutingRulesTool: ToolDefinition = {
  name: 'get_routing_rules',
  description: 'Get the routing rules that determine how tasks are assigned to different MCPs and tools',
  schema: GetRoutingRulesSchema,
  handler: async (args: z.infer<typeof GetRoutingRulesSchema>, context: ToolContext) => {
    const { correlationId, logger: contextLogger } = context;
    
    contextLogger.info('Getting routing rules', {
      correlationId,
      taskTypeFilter: args.task_type
    });

    try {
      const allRules = mcpOrchestrator.getRoutingRules();
      
      // Filter by task type if requested
      const filteredRules = args.task_type
        ? allRules.filter(rule => rule.condition.task_type?.includes(args.task_type!))
        : allRules;

      const rulesSummary = filteredRules.map(rule => ({
        name: rule.name,
        condition: rule.condition,
        primary_action: rule.primary_mcp && rule.tool
          ? { mcp: rule.primary_mcp, tool: rule.tool, params: rule.params }
          : undefined,
        sequence_actions: rule.sequence?.map(step => ({
          mcp: step.mcp,
          tool: step.tool,
          params: step.params
        })),
        fallback: rule.fallback,
        description: `Routes ${rule.condition.task_type?.join(', ') || 'tasks'} to ${
          rule.primary_mcp ? `${rule.primary_mcp}.${rule.tool}` : 'sequence'
        }`
      }));

      return {
        success: true,
        data: {
          total_rules: rulesSummary.length,
          filtered_by: args.task_type || 'none',
          rules: rulesSummary,
          task_types_covered: [...new Set(filteredRules.flatMap(rule => rule.condition.task_type || []))],
          complexity_levels: [...new Set(filteredRules.flatMap(rule => rule.condition.complexity || []))]
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Failed to get routing rules', { correlationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};

// List Available Workflows Tool - Show predefined workflows
export const ListWorkflowsTool: ToolDefinition = {
  name: 'list_workflows',
  description: 'List all available predefined workflows for complex multi-step processes',
  schema: z.object({}),
  handler: async (args: {}, context: ToolContext) => {
    const { correlationId, logger: contextLogger } = context;
    
    contextLogger.info('Listing available workflows', { correlationId });

    try {
      const workflows = mcpOrchestrator.getWorkflows();
      
      const workflowsSummary = Object.entries(workflows).map(([name, workflow]) => ({
        name,
        description: workflow.description,
        triggers: workflow.triggers,
        step_count: workflow.steps.length,
        steps: workflow.steps.map(step => ({
          name: step.name,
          mcp: step.mcp,
          tool: step.tool,
          optional: step.condition !== undefined
        })),
        mcps_involved: [...new Set(workflow.steps.map(step => step.mcp))],
        estimated_duration: estimateWorkflowDuration(workflow.steps)
      }));

      return {
        success: true,
        data: {
          total_workflows: workflowsSummary.length,
          workflows: workflowsSummary,
          available_triggers: [...new Set(workflowsSummary.flatMap(w => w.triggers))],
          mcps_used: [...new Set(workflowsSummary.flatMap(w => w.mcps_involved))]
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };

    } catch (error) {
      contextLogger.error('Failed to list workflows', { correlationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: 0,
          timestamp: new Date(),
          version: '1.0.0'
        }
      };
    }
  }
};

// Helper function for workflow duration estimation
function estimateWorkflowDuration(steps: any[]): string {
  // Simple duration estimation based on step types
  const baseTime = steps.length * 5; // 5 seconds per step baseline
  const aiSteps = steps.filter(s => ['poe', 'perplexity'].includes(s.mcp)).length;
  const deploySteps = steps.filter(s => s.mcp === 'vercel').length;
  
  const estimated = baseTime + (aiSteps * 20) + (deploySteps * 30); // AI: +20s, Deploy: +30s
  return `${estimated}s`;
}
