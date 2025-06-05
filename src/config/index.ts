import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables
dotenv.config();

// Configuration schema with validation
const configSchema = z.object({
  // Database
  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(5432),
    name: z.string().default('llm_context_db'),
    user: z.string().default('jtaylor'),
    password: z.string(),
    ssl: z.boolean().default(false),
    poolMin: z.number().default(2),
    poolMax: z.number().default(20),
    idleTimeout: z.number().default(10000),
    connectionTimeout: z.number().default(2000),
  }),
  
  // Server
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('localhost'),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  }),
  
  // Security
  security: z.object({
    jwtSecret: z.string().min(32),
    jwtExpiresIn: z.string().default('7d'),
    bcryptRounds: z.number().default(12),
    apiKeyEncryptionKey: z.string().length(32),
  }),
  
  // Rate Limiting
  rateLimit: z.object({
    windowMs: z.number().default(900000), // 15 minutes
    maxRequests: z.number().default(100),
    skipSuccessfulRequests: z.boolean().default(false),
  }),
  
  // Caching
  cache: z.object({
    redisUrl: z.string().default('redis://localhost:6379'),
    redisPassword: z.string().optional(),
    redisDb: z.number().default(0),
    ttl: z.number().default(3600),
  }),
  
  // Monitoring
  monitoring: z.object({
    metricsEnabled: z.boolean().default(true),
    metricsPort: z.number().default(9090),
    tracingEnabled: z.boolean().default(true),
    tracingEndpoint: z.string().default('http://localhost:14268/api/traces'),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    logFormat: z.enum(['json', 'text']).default('json'),
  }),
  
  // MCP Server
  mcp: z.object({
    serverName: z.string().default('llm-context-server'),
    serverVersion: z.string().default('1.0.0'),
    maxContextSize: z.number().default(50000),
    contextOverlap: z.number().default(1000),
    enableCompression: z.boolean().default(true),
  }),
  
  // Feature Flags
  features: z.object({
    enableAuth: z.boolean().default(true),
    enableAuditLog: z.boolean().default(true),
    enableEncryption: z.boolean().default(true),
    enableBackup: z.boolean().default(true),
  }),
  
  // Backup
  backup: z.object({
    schedule: z.string().default('0 2 * * *'),
    retentionDays: z.number().default(30),
    storagePath: z.string().default('/var/backups/llm-context'),
  }),
});

export type Config = z.infer<typeof configSchema>;

// Create and validate configuration
function createConfig(): Config {
  const rawConfig = {
    database: {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      name: process.env.DATABASE_NAME,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD || '',
      ssl: process.env.DATABASE_SSL === 'true',
      poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2'),
      poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20'),
      idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '10000'),
      connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '2000'),
    },
    
    server: {
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.HOST,
      nodeEnv: process.env.NODE_ENV as 'development' | 'production' | 'test',
    },
    
    security: {
      jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-min-32-chars',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN,
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
      apiKeyEncryptionKey: process.env.API_KEY_ENCRYPTION_KEY || 'change-me-32-char-encryption-key',
    },
    
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
    },
    
    cache: {
      redisUrl: process.env.REDIS_URL,
      redisPassword: process.env.REDIS_PASSWORD,
      redisDb: parseInt(process.env.REDIS_DB || '0'),
      ttl: parseInt(process.env.CACHE_TTL || '3600'),
    },
    
    monitoring: {
      metricsEnabled: process.env.METRICS_ENABLED !== 'false',
      metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
      tracingEnabled: process.env.TRACING_ENABLED !== 'false',
      tracingEndpoint: process.env.TRACING_ENDPOINT,
      logLevel: process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug',
      logFormat: process.env.LOG_FORMAT as 'json' | 'text',
    },
    
    mcp: {
      serverName: process.env.MCP_SERVER_NAME,
      serverVersion: process.env.MCP_SERVER_VERSION,
      maxContextSize: parseInt(process.env.MCP_MAX_CONTEXT_SIZE || '50000'),
      contextOverlap: parseInt(process.env.MCP_CONTEXT_OVERLAP || '1000'),
      enableCompression: process.env.MCP_ENABLE_COMPRESSION !== 'false',
    },
    
    features: {
      enableAuth: process.env.ENABLE_AUTH !== 'false',
      enableAuditLog: process.env.ENABLE_AUDIT_LOG !== 'false',
      enableEncryption: process.env.ENABLE_ENCRYPTION !== 'false',
      enableBackup: process.env.ENABLE_BACKUP !== 'false',
    },
    
    backup: {
      schedule: process.env.BACKUP_SCHEDULE,
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
      storagePath: process.env.BACKUP_STORAGE_PATH,
    },
  };
  
  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}

export const config = createConfig();
export default config;

