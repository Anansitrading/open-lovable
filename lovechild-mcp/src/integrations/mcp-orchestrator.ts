import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { z } from 'zod';
import { logger } from '../core/logger.js';
import { nanoid } from 'nanoid';

// Type definitions for orchestration configuration
interface MCPServer {
  name: string;
  description: string;
  endpoint: {
    type: 'mcp_call' | 'http' | 'cli';
    server_name?: string;
    url?: string;
    command?: string;
    args?: string[];
  };
  capabilities: string[];
  tools: Record<string, {
    description: string;
    use_cases: string[];
    parameters: Record<string, string>;
  }>;
  models?: Record<string, string>;
}

interface RoutingRule {
  name: string;
  condition: {
    task_type?: string[];
    complexity?: string[];
    context_required?: boolean;
    target?: string[];
  };
  primary_mcp?: string;
  tool?: string;
  params?: Record<string, any>;
  fallback?: {
    mcp: string;
    tool: string;
    params?: Record<string, any>;
  };
  sequence?: Array<{
    mcp: string;
    tool: string;
    params?: Record<string, any>;
    pass_result_to_next?: boolean;
    use_previous_result?: boolean;
  }>;
}

interface WorkflowStep {
  name: string;
  mcp: string;
  tool: string;
  params?: Record<string, any>;
  condition?: string;
  use_context_from?: string[];
  use_issue_from?: string;
  use_previous_result?: boolean;
}

interface Workflow {
  description: string;
  triggers: string[];
  steps: WorkflowStep[];
}

interface OrchestrationConfig {
  mcp_servers: Record<string, MCPServer>;
  routing_rules: RoutingRule[];
  workflows: Record<string, Workflow>;
  fallback_strategies: Array<{
    condition: string;
    strategy: string;
    max_retries?: number;
    delay_seconds?: number[];
    mappings?: Record<string, {
      fallback_mcp: string;
      fallback_tool: string;
      params?: Record<string, any>;
    }>;
    notification?: string;
  }>;
  integration_settings: {
    default_timeout: number;
    max_concurrent_calls: number;
    result_caching: boolean;
    cache_duration: number;
    logging: {
      level: string;
      include_payloads: boolean;
      include_responses: boolean;
      correlation_tracking: boolean;
    };
  };
  model_preferences: Record<string, {
    primary: string;
    fallback: string;
  }>;
}

interface TaskContext {
  task_type: string;
  complexity?: 'low' | 'medium' | 'high';
  context_required?: boolean;
  target?: string;
  description?: string;
  metadata?: Record<string, any>;
  correlationId: string;
}

interface MCPCallResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
  mcp_server: string;
  tool: string;
}

export class MCPOrchestrator {
  private config!: OrchestrationConfig; // Using definite assignment assertion since loadConfiguration is called in constructor
  private resultCache = new Map<string, { result: any; timestamp: number }>();
  private workflowStates = new Map<string, { id: string; results: Record<string, any>; issues: Record<string, any> }>();

  constructor() {
    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    try {
      const configPath = join(process.cwd(), 'src/config/mcp-orchestration.yaml');
      const configFile = readFileSync(configPath, 'utf8');
      this.config = parse(configFile) as OrchestrationConfig;
      
      logger.info('MCP orchestration configuration loaded successfully', {
        servers: Object.keys(this.config.mcp_servers).length,
        rules: this.config.routing_rules.length,
        workflows: Object.keys(this.config.workflows).length
      });
    } catch (error) {
      logger.error('Failed to load MCP orchestration configuration', { error });
      throw new Error('MCP orchestration configuration is required');
    }
  }

  /**
   * Intelligently route a task to the appropriate MCP server and tool
   */
  async routeTask(taskContext: TaskContext, payload: Record<string, any>): Promise<MCPCallResult> {
    const correlationId = taskContext.correlationId || nanoid();
    
    logger.info('Routing task through MCP orchestrator', {
      correlationId,
      taskType: taskContext.task_type,
      complexity: taskContext.complexity
    });

    try {
      // Find matching routing rule
      const matchingRule = this.findMatchingRule(taskContext);
      
      if (!matchingRule) {
        return {
          success: false,
          error: `No routing rule found for task type: ${taskContext.task_type}`,
          mcp_server: '',
          tool: ''
        };
      }

      // Execute based on rule type
      if (matchingRule.sequence) {
        return await this.executeSequence(matchingRule.sequence, payload, correlationId);
      } else if (matchingRule.primary_mcp && matchingRule.tool) {
        return await this.executeSingleCall(
          matchingRule.primary_mcp,
          matchingRule.tool,
          { ...payload, ...matchingRule.params },
          correlationId,
          matchingRule.fallback
        );
      }

      throw new Error('Invalid routing rule configuration');

    } catch (error) {
      logger.error('Task routing failed', { correlationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        mcp_server: '',
        tool: ''
      };
    }
  }

  /**
   * Execute a complete workflow
   */
  async executeWorkflow(workflowName: string, payload: Record<string, any>): Promise<{
    success: boolean;
    results: MCPCallResult[];
    workflowId: string;
  }> {
    const workflowId = nanoid();
    const correlationId = payload.correlationId || workflowId;
    
    logger.info('Starting workflow execution', {
      workflowId,
      correlationId,
      workflowName
    });

    const workflow = this.config.workflows[workflowName];
    if (!workflow) {
      return {
        success: false,
        results: [{
          success: false,
          error: `Workflow '${workflowName}' not found`,
          mcp_server: '',
          tool: ''
        }],
        workflowId
      };
    }

    const results: MCPCallResult[] = [];
    const workflowState = { 
      id: workflowId, 
      results: {} as Record<string, any>, 
      issues: {} as Record<string, any> 
    };
    this.workflowStates.set(workflowId, workflowState);

    try {
      for (const step of workflow.steps) {
        logger.info('Executing workflow step', {
          workflowId,
          stepName: step.name,
          mcp: step.mcp,
          tool: step.tool
        });

        // Check conditions
        if (step.condition && !this.evaluateCondition(step.condition, payload)) {
          logger.info('Skipping step due to condition', {
            workflowId,
            stepName: step.name,
            condition: step.condition
          });
          continue;
        }

        // Prepare step payload
        const stepPayload = { ...payload, ...step.params };
        
        // Add context from previous steps
        if (step.use_context_from) {
          for (const contextStep of step.use_context_from) {
            if (workflowState.results[contextStep]) {
              stepPayload.context = stepPayload.context || {};
              stepPayload.context[contextStep] = workflowState.results[contextStep];
            }
          }
        }

        // Use issue ID from previous step
        if (step.use_issue_from && workflowState.issues[step.use_issue_from]) {
          stepPayload.id = workflowState.issues[step.use_issue_from];
        }

        // Execute step
        const result = await this.executeSingleCall(
          step.mcp,
          step.tool,
          stepPayload,
          correlationId
        );

        results.push(result);

        // Store result for future steps
        workflowState.results[step.name] = result.data;

        // Store issue ID if this step created an issue
        if (result.success && result.data?.id && step.tool === 'create_issue') {
          workflowState.issues[step.name] = result.data.id;
        }

        // Stop workflow if step failed (unless it's a non-critical step)
        if (!result.success && !this.isOptionalStep(step)) {
          logger.error('Workflow stopped due to step failure', {
            workflowId,
            stepName: step.name,
            error: result.error
          });
          break;
        }
      }

      const allSuccessful = results.every(r => r.success);
      
      logger.info('Workflow execution completed', {
        workflowId,
        success: allSuccessful,
        stepsExecuted: results.length
      });

      return {
        success: allSuccessful,
        results,
        workflowId
      };

    } catch (error) {
      logger.error('Workflow execution failed', { workflowId, error });
      return {
        success: false,
        results: results.length > 0 ? results : [{
          success: false,
          error: error instanceof Error ? error.message : String(error),
          mcp_server: '',
          tool: ''
        }],
        workflowId
      };
    } finally {
      this.workflowStates.delete(workflowId);
    }
  }

  /**
   * Get available MCPs and their capabilities
   */
  getAvailableMCPs(): Record<string, MCPServer> {
    return this.config.mcp_servers;
  }

  /**
   * Get routing rules for introspection
   */
  getRoutingRules(): RoutingRule[] {
    return this.config.routing_rules;
  }

  /**
   * Get available workflows
   */
  getWorkflows(): Record<string, Workflow> {
    return this.config.workflows;
  }

  private findMatchingRule(taskContext: TaskContext): RoutingRule | null {
    for (const rule of this.config.routing_rules) {
      if (this.matchesCondition(rule.condition, taskContext)) {
        return rule;
      }
    }
    return null;
  }

  private matchesCondition(condition: RoutingRule['condition'], taskContext: TaskContext): boolean {
    if (condition.task_type && !condition.task_type.includes(taskContext.task_type)) {
      return false;
    }
    
    if (condition.complexity && taskContext.complexity && !condition.complexity.includes(taskContext.complexity)) {
      return false;
    }

    if (condition.context_required !== undefined && condition.context_required !== taskContext.context_required) {
      return false;
    }

    if (condition.target && taskContext.target && !condition.target.includes(taskContext.target)) {
      return false;
    }

    return true;
  }

  private async executeSequence(
    sequence: RoutingRule['sequence'], 
    payload: Record<string, any>,
    correlationId: string
  ): Promise<MCPCallResult> {
    const results: any[] = [];
    let currentPayload = { ...payload };

    for (let i = 0; i < sequence!.length; i++) {
      const step = sequence![i];
      
      if (step.use_previous_result && results.length > 0) {
        currentPayload.previousResult = results[results.length - 1];
      }

      const result = await this.executeSingleCall(
        step.mcp,
        step.tool,
        { ...currentPayload, ...step.params },
        correlationId
      );

      if (!result.success) {
        return result; // Return first failure
      }

      results.push(result.data);

      if (step.pass_result_to_next) {
        currentPayload = { ...currentPayload, ...result.data };
      }
    }

    return {
      success: true,
      data: results,
      mcp_server: 'sequence',
      tool: 'multi-step'
    };
  }

  private async executeSingleCall(
    mcpServer: string,
    tool: string,
    payload: Record<string, any>,
    correlationId: string,
    fallback?: RoutingRule['fallback']
  ): Promise<MCPCallResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = `${mcpServer}:${tool}:${JSON.stringify(payload)}`;
      if (this.config.integration_settings.result_caching) {
        const cached = this.resultCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.config.integration_settings.cache_duration * 1000) {
          logger.debug('Returning cached result', { mcpServer, tool, correlationId });
          return {
            success: true,
            data: cached.result,
            executionTime: 0,
            mcp_server: mcpServer,
            tool
          };
        }
      }

      // Execute the actual MCP call
      const result = await this.callMCPTool(mcpServer, tool, payload, correlationId);
      
      // Cache successful results
      if (result.success && this.config.integration_settings.result_caching) {
        this.resultCache.set(cacheKey, {
          result: result.data,
          timestamp: Date.now()
        });
      }

      result.executionTime = Date.now() - startTime;
      return result;

    } catch (error) {
      logger.error('MCP call failed, attempting fallback', {
        mcpServer,
        tool,
        correlationId,
        error
      });

      // Try fallback if available
      if (fallback) {
        return await this.executeSingleCall(
          fallback.mcp,
          fallback.tool,
          { ...payload, ...fallback.params },
          correlationId
        );
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        mcp_server: mcpServer,
        tool
      };
    }
  }

  private async callMCPTool(
    mcpServer: string,
    tool: string,
    payload: Record<string, any>,
    correlationId: string
  ): Promise<MCPCallResult> {
    const server = this.config.mcp_servers[mcpServer];
    if (!server) {
      throw new Error(`MCP server '${mcpServer}' not found in configuration`);
    }

    logger.info('Calling MCP tool', {
      mcpServer,
      tool,
      correlationId,
      endpoint: server.endpoint.type
    });

    try {
      // Call through Warp's MCP infrastructure
      const result = await this.makeWarpMCPCall(server.endpoint.server_name || mcpServer, tool, payload);
      
      return {
        success: true,
        data: result,
        mcp_server: mcpServer,
        tool
      };
    } catch (error) {
      logger.error('MCP call failed', {
        mcpServer,
        tool,
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        mcp_server: mcpServer,
        tool
      };
    }
  }

  /**
   * Make a real MCP call through Warp's infrastructure
   * This is the key method that connects to other MCP servers in Warp
   */
  private async makeWarpMCPCall(
    mcpServerName: string,
    tool: string,
    payload: Record<string, any>
  ): Promise<any> {
    // Map our configuration names to actual Warp MCP server names
    const warpMCPNameMap: Record<string, string> = {
      'Perplexity': 'perplexity-ask',
      'Linear': 'linear',
      'POE': 'Dart', // Assuming POE is accessible through Dart MCP
      'Context7': 'Context7',
      'Vercel': 'vercel'
    };

    const actualMCPName = warpMCPNameMap[mcpServerName] || mcpServerName.toLowerCase();
    
    logger.info('Making Warp MCP call', {
      configuredName: mcpServerName,
      actualMCPName,
      tool,
      payload: this.config.integration_settings.logging.include_payloads ? payload : '[REDACTED]'
    });

    try {
      // This is where we need to use Warp's MCP calling mechanism
      // Since we're running inside Warp's MCP environment, we should have access to call_mcp_tool
      
      // For now, we'll use a mechanism that should work within Warp's context
      // This assumes we have access to a global MCP calling function or can import it
      const result = await this.executeWarpMCPCall(actualMCPName, tool, payload);
      
      return result;
    } catch (error) {
      logger.error('Warp MCP call failed', {
        mcpServerName,
        actualMCPName,
        tool,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Execute MCP call using Warp's call_mcp_tool function
   */
  private async executeWarpMCPCall(
    mcpName: string,
    tool: string,
    payload: Record<string, any>
  ): Promise<any> {
    logger.info('Executing real MCP call through Warp', { mcpName, tool });
    
    try {
      // Use the call_mcp_tool function from Warp's environment
      // This function takes (name, input) parameters where input is a JSON string
      const inputPayload = JSON.stringify(payload);
      
      // Call the MCP tool using Warp's infrastructure
      const result = await call_mcp_tool(mcpName, inputPayload);
      
      logger.info('MCP tool call successful', { mcpName, tool });
      return result;
      
    } catch (error) {
      logger.error('MCP tool call failed', {
        mcpName,
        tool,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Simulate MCP calls for development and testing
   */
  private async simulateMCPCall(
    mcpName: string,
    tool: string,
    payload: Record<string, any>
  ): Promise<any> {
    logger.info('Simulating MCP call', { mcpName, tool });
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay

    // Return realistic mock responses based on the tool
    switch (tool) {
      case 'perplexity_ask':
        return {
          content: `Mock research response for: ${payload.messages?.[0]?.content || payload.query || 'research query'}`,
          sources: ['https://example.com', 'https://example.org']
        };
        
      case 'create_issue':
        return {
          id: `mock-issue-${Date.now()}`,
          title: payload.title,
          state: payload.state || 'In Progress',
          assignee: payload.assignee
        };
        
      case 'deploy_to_vercel':
        return {
          id: `mock-deployment-${Date.now()}`,
          url: `https://mock-deployment-${Date.now()}.vercel.app`,
          status: 'ready',
          environment: payload.environment || 'preview'
        };
        
      case 'get_library_docs':
        return {
          library: payload.context7CompatibleLibraryID,
          documentation: `Mock documentation for ${payload.context7CompatibleLibraryID}`,
          version: '1.0.0'
        };
        
      default:
        return {
          message: `Mock response from ${mcpName}.${tool}`,
          payload,
          timestamp: new Date().toISOString()
        };
    }
  }

  private evaluateCondition(condition: string, payload: Record<string, any>): boolean {
    // Simple condition evaluation - could be enhanced with a proper expression parser
    switch (condition) {
      case 'library_needed':
        return payload.library || payload.dependencies;
      case 'context_needed':
        return payload.codebase || payload.repository;
      case 'library_research_needed':
        return payload.library_research || payload.api_docs;
      default:
        return true;
    }
  }

  private isOptionalStep(step: WorkflowStep): boolean {
    // Define which steps are optional and shouldn't stop the workflow on failure
    const optionalSteps = ['get_context', 'get_codebase_context', 'get_technical_context'];
    return optionalSteps.includes(step.name);
  }
}

export const mcpOrchestrator = new MCPOrchestrator();