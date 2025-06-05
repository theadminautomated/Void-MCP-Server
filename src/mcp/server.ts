import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from '../config';
import logger from '../utils/logger';
import { ContextService } from '../services/ContextService';
import { AuthService } from '../services/AuthService';
import { AuditService } from '../services/AuditService';
import { CacheService } from '../services/CacheService';
import { z } from 'zod';

export class MCPServer {
  private server: Server;
  private contextService: ContextService;
  private authService: AuthService;
  private auditService: AuditService;
  private cacheService: CacheService;
  
  constructor() {
    this.server = new Server(
      {
        name: config.mcp.serverName,
        version: config.mcp.serverVersion,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );
    
    this.contextService = new ContextService();
    this.authService = new AuthService();
    this.auditService = new AuditService();
    this.cacheService = new CacheService();
    
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_context',
            description: 'Search through stored context using semantic or full-text search',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query string',
                },
                collection_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional list of collection IDs to search within',
                },
                search_type: {
                  type: 'string',
                  enum: ['semantic', 'fulltext', 'hybrid'],
                  default: 'hybrid',
                  description: 'Type of search to perform',
                },
                limit: {
                  type: 'number',
                  default: 10,
                  maximum: 100,
                  description: 'Maximum number of results to return',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by tags',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_context_item',
            description: 'Retrieve a specific context item by ID',
            inputSchema: {
              type: 'object',
              properties: {
                item_id: {
                  type: 'string',
                  description: 'UUID of the context item',
                },
                include_versions: {
                  type: 'boolean',
                  default: false,
                  description: 'Include version history',
                },
              },
              required: ['item_id'],
            },
          },
          {
            name: 'create_context_item',
            description: 'Create a new context item',
            inputSchema: {
              type: 'object',
              properties: {
                collection_id: {
                  type: 'string',
                  description: 'UUID of the target collection',
                },
                title: {
                  type: 'string',
                  description: 'Title of the context item',
                },
                content: {
                  type: 'string',
                  description: 'Content of the context item',
                },
                content_type: {
                  type: 'string',
                  default: 'text/plain',
                  description: 'MIME type of the content',
                },
                source_url: {
                  type: 'string',
                  description: 'Optional source URL',
                },
                source_type: {
                  type: 'string',
                  enum: ['file', 'url', 'api', 'manual'],
                  default: 'manual',
                  description: 'Type of source',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags for categorization',
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata',
                },
              },
              required: ['collection_id', 'title', 'content'],
            },
          },
          {
            name: 'update_context_item',
            description: 'Update an existing context item',
            inputSchema: {
              type: 'object',
              properties: {
                item_id: {
                  type: 'string',
                  description: 'UUID of the context item to update',
                },
                title: {
                  type: 'string',
                  description: 'New title',
                },
                content: {
                  type: 'string',
                  description: 'New content',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Updated tags',
                },
                metadata: {
                  type: 'object',
                  description: 'Updated metadata',
                },
                change_summary: {
                  type: 'string',
                  description: 'Summary of changes made',
                },
              },
              required: ['item_id'],
            },
          },
          {
            name: 'list_collections',
            description: 'List available context collections',
            inputSchema: {
              type: 'object',
              properties: {
                include_public: {
                  type: 'boolean',
                  default: true,
                  description: 'Include public collections',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by tags',
                },
                limit: {
                  type: 'number',
                  default: 50,
                  maximum: 200,
                  description: 'Maximum number of collections to return',
                },
                offset: {
                  type: 'number',
                  default: 0,
                  description: 'Offset for pagination',
                },
              },
            },
          },
          {
            name: 'create_collection',
            description: 'Create a new context collection',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Name of the collection',
                },
                description: {
                  type: 'string',
                  description: 'Description of the collection',
                },
                is_public: {
                  type: 'boolean',
                  default: false,
                  description: 'Whether the collection is public',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags for categorization',
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata',
                },
              },
              required: ['name'],
            },
          },
          {
            name: 'get_analytics',
            description: 'Get usage analytics and insights',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['search', 'usage', 'performance'],
                  default: 'usage',
                  description: 'Type of analytics to retrieve',
                },
                start_date: {
                  type: 'string',
                  format: 'date',
                  description: 'Start date for analytics (YYYY-MM-DD)',
                },
                end_date: {
                  type: 'string',
                  format: 'date',
                  description: 'End date for analytics (YYYY-MM-DD)',
                },
                collection_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by specific collections',
                },
              },
            },
          },
        ],
      };
    });
    
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        // Authenticate request if auth is enabled
        let userId: string | undefined;
        if (config.features.enableAuth) {
          // Extract user context from request headers or API key
          userId = await this.extractUserFromRequest(request);
        }
        
        // Log the tool call for audit purposes
        if (config.features.enableAuditLog) {
          await this.auditService.logToolCall(name, args, userId);
        }
        
        const startTime = Date.now();
        let result: any;
        
        switch (name) {
          case 'search_context':
            result = await this.handleSearchContext(args, userId);
            break;
          case 'get_context_item':
            result = await this.handleGetContextItem(args, userId);
            break;
          case 'create_context_item':
            result = await this.handleCreateContextItem(args, userId);
            break;
          case 'update_context_item':
            result = await this.handleUpdateContextItem(args, userId);
            break;
          case 'list_collections':
            result = await this.handleListCollections(args, userId);
            break;
          case 'create_collection':
            result = await this.handleCreateCollection(args, userId);
            break;
          case 'get_analytics':
            result = await this.handleGetAnalytics(args, userId);
            break;
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        
        const duration = Date.now() - startTime;
        logger.performance(`tool_call_${name}`, duration, { userId, argsLength: JSON.stringify(args).length });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool call error for ${name}:`, error);
        throw error;
      }
    });
    
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'context://collections',
            name: 'Context Collections',
            description: 'List of available context collections',
            mimeType: 'application/json',
          },
          {
            uri: 'context://schema',
            name: 'Database Schema',
            description: 'Current database schema information',
            mimeType: 'application/json',
          },
          {
            uri: 'context://stats',
            name: 'Server Statistics',
            description: 'Current server statistics and health',
            mimeType: 'application/json',
          },
        ],
      };
    });
    
    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      switch (uri) {
        case 'context://collections':
          const collections = await this.contextService.listCollections({}, undefined);
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(collections, null, 2),
              },
            ],
          };
        
        case 'context://schema':
          const schema = await this.contextService.getSchemaInfo();
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(schema, null, 2),
              },
            ],
          };
        
        case 'context://stats':
          const stats = await this.getServerStats();
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(stats, null, 2),
              },
            ],
          };
        
        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      }
    });
  }
  
  private async extractUserFromRequest(request: any): Promise<string | undefined> {
    // In a real implementation, you would extract the user ID from
    // request headers, JWT tokens, or API keys
    // For now, return a default user ID
    return '00000000-0000-0000-0000-000000000000';
  }
  
  private async handleSearchContext(args: any, userId?: string) {
    const schema = z.object({
      query: z.string(),
      collection_ids: z.array(z.string()).optional(),
      search_type: z.enum(['semantic', 'fulltext', 'hybrid']).default('hybrid'),
      limit: z.number().max(100).default(10),
      tags: z.array(z.string()).optional(),
    });
    
    const validated = schema.parse(args);
    return await this.contextService.searchContext(validated, userId);
  }
  
  private async handleGetContextItem(args: any, userId?: string) {
    const schema = z.object({
      item_id: z.string().uuid(),
      include_versions: z.boolean().default(false),
    });
    
    const validated = schema.parse(args);
    return await this.contextService.getContextItem(validated.item_id, validated.include_versions, userId);
  }
  
  private async handleCreateContextItem(args: any, userId?: string) {
    const schema = z.object({
      collection_id: z.string().uuid(),
      title: z.string().max(500),
      content: z.string(),
      content_type: z.string().default('text/plain'),
      source_url: z.string().url().optional(),
      source_type: z.enum(['file', 'url', 'api', 'manual']).default('manual'),
      tags: z.array(z.string()).default([]),
      metadata: z.record(z.any()).default({}),
    });
    
    const validated = schema.parse(args);
    return await this.contextService.createContextItem(validated, userId);
  }
  
  private async handleUpdateContextItem(args: any, userId?: string) {
    const schema = z.object({
      item_id: z.string().uuid(),
      title: z.string().max(500).optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
      change_summary: z.string().optional(),
    });
    
    const validated = schema.parse(args);
    return await this.contextService.updateContextItem(validated, userId);
  }
  
  private async handleListCollections(args: any, userId?: string) {
    const schema = z.object({
      include_public: z.boolean().default(true),
      tags: z.array(z.string()).optional(),
      limit: z.number().max(200).default(50),
      offset: z.number().default(0),
    });
    
    const validated = schema.parse(args);
    return await this.contextService.listCollections(validated, userId);
  }
  
  private async handleCreateCollection(args: any, userId?: string) {
    const schema = z.object({
      name: z.string().max(255),
      description: z.string().optional(),
      is_public: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      metadata: z.record(z.any()).default({}),
    });
    
    const validated = schema.parse(args);
    return await this.contextService.createCollection(validated, userId);
  }
  
  private async handleGetAnalytics(args: any, userId?: string) {
    const schema = z.object({
      type: z.enum(['search', 'usage', 'performance']).default('usage'),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      collection_ids: z.array(z.string()).optional(),
    });
    
    const validated = schema.parse(args);
    return await this.contextService.getAnalytics(validated, userId);
  }
  
  private async getServerStats() {
    const dbHealth = await this.contextService.healthCheck();
    return {
      server: {
        name: config.mcp.serverName,
        version: config.mcp.serverVersion,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      database: dbHealth,
      cache: await this.cacheService.getStats(),
      timestamp: new Date().toISOString(),
    };
  }
  
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Server started successfully');
  }
  
  async stop(): Promise<void> {
    await this.server.close();
    logger.info('MCP Server stopped');
  }
}

