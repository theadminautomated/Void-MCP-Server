import winston from 'winston';
import { config } from '../config';

// Custom log format
const customFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const textFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.monitoring.logLevel,
  format: config.monitoring.logFormat === 'json' ? customFormat : textFormat,
  defaultMeta: {
    service: config.mcp.serverName,
    version: config.mcp.serverVersion,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
    
    // File transports for production
    ...(config.server.nodeEnv === 'production' ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
      }),
    ] : []),
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(config.server.nodeEnv === 'production' ? [
      new winston.transports.File({ filename: 'logs/exceptions.log' })
    ] : []),
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.Console(),
    ...(config.server.nodeEnv === 'production' ? [
      new winston.transports.File({ filename: 'logs/rejections.log' })
    ] : []),
  ],
});

// Add request logging helper
logger.addRequestContext = function(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    userId,
  });
};

// Add audit logging helper
logger.audit = function(action: string, resourceType: string, resourceId: string, userId?: string, metadata?: any) {
  logger.info('AUDIT', {
    action,
    resourceType,
    resourceId,
    userId,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

// Add security logging helper
logger.security = function(event: string, details: any) {
  logger.warn('SECURITY_EVENT', {
    event,
    details,
    timestamp: new Date().toISOString(),
  });
};

// Add performance logging helper
logger.performance = function(operation: string, duration: number, metadata?: any) {
  logger.info('PERFORMANCE', {
    operation,
    duration,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

export default logger;

