#!/usr/bin/env node
/**
 * Test script for MCP orchestration functionality
 * Run with: node test-orchestration.js
 */

// Simple test to verify the orchestration system loads correctly
async function testOrchestrationSystem() {
  console.log('🚀 Testing LoveChild MCP Orchestration System...\n');
  
  try {
    // Import the orchestrator
    const { mcpOrchestrator } = await import('./dist/integrations/mcp-orchestrator.js');
    
    console.log('✅ MCP Orchestrator loaded successfully');
    
    // Test configuration loading
    const availableMCPs = mcpOrchestrator.getAvailableMCPs();
    const routingRules = mcpOrchestrator.getRoutingRules();
    const workflows = mcpOrchestrator.getWorkflows();
    
    console.log(`✅ Configuration loaded:`);
    console.log(`   - ${Object.keys(availableMCPs).length} MCP servers configured`);
    console.log(`   - ${routingRules.length} routing rules defined`);
    console.log(`   - ${Object.keys(workflows).length} workflows available`);
    
    // List configured MCPs
    console.log('\n📋 Configured MCP Servers:');
    Object.entries(availableMCPs).forEach(([id, server]) => {
      console.log(`   - ${id}: ${server.name} (${server.capabilities.join(', ')})`);
    });
    
    // List available workflows
    console.log('\n🔄 Available Workflows:');
    Object.entries(workflows).forEach(([name, workflow]) => {
      console.log(`   - ${name}: ${workflow.description} (${workflow.steps.length} steps)`);
    });
    
    console.log('\n✅ All orchestration components loaded successfully!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Start your LoveChild MCP server with: npm start');
    console.log('   2. Configure it in Warp as an MCP server');
    console.log('   3. Use tools like "route_task" and "execute_workflow" to orchestrate other MCPs');
    
  } catch (error) {
    console.error('❌ Error testing orchestration system:', error.message);
    console.error('\nStacktrace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testOrchestrationSystem();