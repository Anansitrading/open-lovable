#!/usr/bin/env node
/**
 * LoveChild MCP Server - Warp Native Mode
 * Uses Warp CLI for all LLM operations - NO API keys required
 * Orchestrates other MCPs through Warp's call_mcp_tool
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from './dist/core/logger.js';

console.error('🚀 Starting LoveChild MCP Server in Warp Native Mode...');
console.error('✅ Using Warp CLI for LLM operations - NO API keys needed');
console.error('✅ Orchestrating MCPs through Warp infrastructure');

// Import all our tools
async function loadTools() {
  const tools = [];
  
  // SpecKit Tools (use Warp CLI for LLM)
  try {
    const { SpecifyTool } = await import('./dist/tools/speckit/specify-tool.js');
    const { PlanTool } = await import('./dist/tools/speckit/plan-tool.js');
    const { TasksTool } = await import('./dist/tools/speckit/tasks-tool.js');
    const { StatusTool } = await import('./dist/tools/speckit/status-tool.js');
    
    tools.push(SpecifyTool, PlanTool, TasksTool, StatusTool);
    console.error('✅ SpecKit tools loaded (4 tools)');
  } catch (e) {
    console.error('⚠️  SpecKit tools not available:', e.message);
  }
  
  // Orchestration Tools (call other MCPs through Warp)
  try {
    const orchestration = await import('./dist/tools/orchestration-tools.js');
    tools.push(
      orchestration.RouteTaskTool,
      orchestration.ExecuteWorkflowTool,
      orchestration.ListMCPsTool,
      orchestration.GetRoutingRulesTool,
      orchestration.ListWorkflowsTool
    );
    console.error('✅ Orchestration tools loaded (5 tools)');
  } catch (e) {
    console.error('⚠️  Orchestration tools not available:', e.message);
  }
  
  // Scrape Tool (uses Firecrawl if available)
  try {
    const { ScrapeTool } = await import('./dist/tools/scrape-tool.js');
    tools.push(ScrapeTool);
    console.error('✅ Scrape tool loaded');
  } catch (e) {
    console.error('⚠️  Scrape tool not available:', e.message);
  }
  
  return tools;
}

async function main() {
  // Create MCP server
  const server = new Server(
    {
      name: 'lovechild-warp-native',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
  
  // Load available tools
  const tools = await loadTools();
  
  if (tools.length === 0) {
    console.error('❌ No tools loaded! Check your build.');
    process.exit(1);
  }
  
  console.error(`\n📋 Loaded ${tools.length} tools:`);
  tools.forEach(tool => {
    console.error(`   - ${tool.name}: ${tool.description?.substring(0, 60)}...`);
  });
  
  // Handle tool listing
  server.setRequestHandler('tools/list', async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description || 'No description',
        inputSchema: tool.schema ? {
          type: 'object',
          properties: {},
          description: 'Tool parameters'
        } : undefined
      }))
    };
  });
  
  // Handle tool execution
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    
    try {
      // Create context for tool execution
      const context = {
        correlationId: `warp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        logger: console,
        workflowManager: {
          // Minimal workflow manager for tools that need it
          getCurrentWorkflow: async () => null,
          createNewWorkflow: async (desc) => ({ 
            id: 'mock', 
            description: desc,
            artifacts: {},
            phase: 'specification'
          }),
          setSpecification: async (spec) => spec,
          updateWorkflowPhase: async (phase) => phase,
          getFilePath: async (file) => `./workspace/${file}`
        }
      };
      
      const result = await tool.handler(args || {}, context);
      
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify(result, null, 2) 
        }] 
      };
      
    } catch (error) {
      console.error(`Tool ${name} failed:`, error);
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
  });
  
  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('\n✨ LoveChild MCP Server (Warp Native) ready!');
  console.error('🎯 Key capabilities:');
  console.error('   - Spec-driven development with Warp CLI');
  console.error('   - Multi-MCP orchestration through Warp');
  console.error('   - No external API keys required');
}

// Start the server
main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
