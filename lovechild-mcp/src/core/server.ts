import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { configManager } from './config.js';
import { logger } from './logger.js';
import { ToolRegistry } from './tool-registry.js';
import { WorkflowManager } from './workflow-manager.js';
import { LoveChildError, ValidationError } from '../types/index.js';

export class LoveChildMCPServer {
  private server: Server;
  private toolRegistry: ToolRegistry;
  private workflowManager: WorkflowManager;
  private initialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'lovechild-mcp',
        version: '1.0.0',
        description: 'LoveChild1.0 MCP Server - Combines SpecKit workflows with Open Lovable\'s AI-powered website cloning'
      },
      {
        capabilities: {
          tools: {},
          logging: {}
        }
      }
    );

    this.toolRegistry = new ToolRegistry();
    this.workflowManager = new WorkflowManager();
    
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.mcpRequest('tools/list', {});
      
      try {
        const tools = await this.toolRegistry.listTools();
        const result = { tools };
        logger.mcpResponse('tools/list', result);
        return result;
      } catch (error) {
        logger.mcpResponse('tools/list', null, error);
        throw error;
      }
    });

    // Execute tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const correlationId = (logger as any).generateCorrelationId();
      
      logger.mcpRequest('tools/call', { name, arguments: args });
      logger.toolStart(name, args, correlationId);
      
      const startTime = Date.now();
      
      try {
        // Get the tool from registry
        const tool = await this.toolRegistry.getTool(name);
        if (!tool) {
          throw new ValidationError(`Unknown tool: ${name}`);
        }

        // Validate arguments against tool schema
        const validatedArgs = tool.schema ? tool.schema.parse(args || {}) : args || {};
        
        // Execute the tool
        const result = await tool.handler(validatedArgs, {
          correlationId,
          workflowManager: this.workflowManager,
          logger
        });

        const executionTime = Date.now() - startTime;
        logger.toolSuccess(name, executionTime, correlationId);
        logger.mcpResponse('tools/call', result);
        
        return {
          content: [{
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.toolError(name, error, executionTime, correlationId);
        logger.mcpResponse('tools/call', null, error);
        
        // Format error for MCP response
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = error instanceof LoveChildError ? error.details : undefined;
        
        return {
          content: [{
            type: 'text',
            text: `Error executing tool '${name}': ${errorMessage}${errorDetails ? '\nDetails: ' + JSON.stringify(errorDetails, null, 2) : ''}`
          }],
          isError: true
        };
      }
    });

    // Handle server errors
    this.server.onerror = (error) => {
      logger.error('MCP server error', error);
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('Initializing LoveChild MCP Server...');
      
      // Load configuration
      await configManager.loadConfig();
      configManager.validateConfiguration();
      logger.info('Configuration loaded and validated');
      
      // Initialize logger with configuration
      await logger.initialize();
      
      // Initialize workflow manager
      await this.workflowManager.initialize();
      logger.info('Workflow manager initialized');
      
      // Register all tools
      await this.toolRegistry.registerAllTools();
      logger.info(`Registered ${await this.toolRegistry.getToolCount()} tools`);
      
      this.initialized = true;
      logger.info('LoveChild MCP Server initialization complete');
      
    } catch (error) {
      logger.error('Failed to initialize MCP server', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.info('Starting LoveChild MCP Server...');
    
    // Create transport
    const transport = new StdioServerTransport();
    
    try {
      // Connect server to transport
      await this.server.connect(transport);
      logger.info('LoveChild MCP Server started successfully');
      
      // Log server capabilities
      const tools = await this.toolRegistry.listTools();
      logger.info('Available tools:', {
        count: tools.length,
        tools: tools.map(t => t.name)
      });
      
    } catch (error) {
      logger.error('Failed to start MCP server', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping LoveChild MCP Server...');
    
    try {
      // Cleanup workflow manager
      await this.workflowManager.cleanup();
      
      // Close server
      await this.server.close();
      
      logger.info('LoveChild MCP Server stopped');
    } catch (error) {
      logger.error('Error stopping MCP server', error);
      throw error;
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', details: any }> {
    const details: any = {
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };

    try {
      // Check configuration
      configManager.getConfig();
      details.config = 'ok';
      
      // Check tool registry
      details.toolCount = await this.toolRegistry.getToolCount();
      details.tools = 'ok';
      
      // Check workflow manager
      const workflowStatus = await this.workflowManager.getStatus();
      details.workflow = workflowStatus;
      
      logger.healthCheck('mcp-server', 'healthy', details);
      return { status: 'healthy', details };
      
    } catch (error) {
      details.error = error instanceof Error ? error.message : 'Unknown error';
      logger.healthCheck('mcp-server', 'unhealthy', details);
      return { status: 'unhealthy', details };
    }
  }

  // Get server statistics
  getStats(): any {
    return {
      initialized: this.initialized,
      toolCount: (this.toolRegistry as any).tools?.size || 0,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      version: '1.0.0'
    };
  }

  // Graceful shutdown handler
  setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      shutdown('unhandledRejection');
    });
  }
}

// Export for use in index.ts
export const createServer = () => new LoveChildMCPServer();
