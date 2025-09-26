#!/usr/bin/env node
/**
 * LoveChild MCP Orchestration Server - Simplified Startup
 * Focused purely on MCP orchestration without sandbox dependencies
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  RouteTaskTool,
  ExecuteWorkflowTool,
  ListMCPsTool,
  GetRoutingRulesTool,
  ListWorkflowsTool
} from './dist/tools/orchestration-tools.js';

const server = new Server(
  {
    name: 'lovechild-orchestrator',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register orchestration tools only
const tools = [
  RouteTaskTool,
  ExecuteWorkflowTool, 
  ListMCPsTool,
  GetRoutingRulesTool,
  ListWorkflowsTool
];

tools.forEach(tool => {
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name === tool.name) {
      try {
        const context = {
          correlationId: `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          logger: console,
          workflowManager: null
        };
        
        const result = await tool.handler(args || {}, context);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: false, 
              error: error.message 
            }, null, 2) 
          }] 
        };
      }
    }
    
    throw new Error(`Tool ${name} not found`);
  });
});

server.setRequestHandler('tools/list', async () => {
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema ? {
        type: 'object',
        properties: {},
        description: 'Tool parameters'
      } : undefined
    }))
  };
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);

console.error('🚀 LoveChild MCP Orchestrator started - Ready for multi-MCP coordination!');
console.error('📋 Available tools:', tools.map(t => t.name).join(', '));