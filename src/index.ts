#!/usr/bin/env node

import { MCPServer } from './mcp/server';
import { db } from './database/connection';
import logger from './utils/logger';
import { config } from './config';

async function main() {
  try {
    logger.info('Starting LLM Context MCP Server', {
      version: config.mcp.serverVersion,
      environment: config.server.nodeEnv,
    });
    
    // Connect to database
    logger.info('Connecting to database...');
    await db.connect();
    
    // Initialize and start MCP server
    logger.info('Initializing MCP server...');
    const mcpServer = new MCPServer();
    
    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await shutdown(mcpServer);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await shutdown(mcpServer);
    });
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
    
    // Start the server
    await mcpServer.start();
    
    logger.info('LLM Context MCP Server started successfully', {
      server_name: config.mcp.serverName,
      version: config.mcp.serverVersion,
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(mcpServer: MCPServer) {
  try {
    logger.info('Shutting down MCP server...');
    await mcpServer.stop();
    
    logger.info('Closing database connection...');
    await db.disconnect();
    
    logger.info('Server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}

