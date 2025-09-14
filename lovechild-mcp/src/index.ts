#!/usr/bin/env node

/**
 * LoveChild1.0 MCP Server
 * 
 * Main entry point for the LoveChild1.0 Model Context Protocol server.
 * Integrates SpecKit workflows with Open Lovable's AI-powered website cloning.
 * 
 * Usage:
 *   node dist/index.js
 * 
 * Environment Variables:
 *   - LOVECHILD_LOG_LEVEL: debug|info|warn|error (default: info)
 *   - LOVECHILD_WORKSPACE_DIR: workspace directory (default: ./workspace)
 *   - LOVECHILD_CONFIG_FILE: config file path (default: ./lovechild.config.json)
 */

import { createServer } from './core/server.js';
import { logger } from './core/logger.js';

async function main() {
  try {
    logger.info('Starting LoveChild1.0 MCP Server...');
    logger.info('Node version:', process.version);
    logger.info('Platform:', process.platform);
    
    // Create and initialize the MCP server
    const server = createServer();
    
    // Setup graceful shutdown handlers
    server.setupGracefulShutdown();
    
    // Start the server
    await server.start();
    
    // Log startup completion
    logger.info('LoveChild1.0 MCP Server is ready to accept connections');
    
    // Log available tools
    const stats = server.getStats();
    logger.info('Server statistics:', stats);
    
    // Perform health check
    const healthCheck = await server.healthCheck();
    logger.info('Initial health check:', healthCheck);
    
    // Keep the process running
    process.on('exit', (code) => {
      logger.info(`LoveChild1.0 MCP Server exiting with code: ${code}`);
    });
    
  } catch (error) {
    logger.error('Failed to start LoveChild1.0 MCP Server:', error);
    
    // Log error details
    if (error instanceof Error) {
      logger.error('Error stack:', error.stack);
    }
    
    // Exit with error code
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', {
    reason,
    promise: promise.toString()
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error during startup:', error);
    process.exit(1);
  });
}

export { main };