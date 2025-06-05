import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from '../config';
import logger from '../utils/logger';

class DatabaseConnection {
  private pool: Pool;
  private isConnected: boolean = false;
  
  constructor() {
    const poolConfig: PoolConfig = {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl,
      min: config.database.poolMin,
      max: config.database.poolMax,
      idleTimeoutMillis: config.database.idleTimeout,
      connectionTimeoutMillis: config.database.connectionTimeout,
      statement_timeout: 30000, // 30 seconds
      query_timeout: 30000,
    };
    
    this.pool = new Pool(poolConfig);
    this.setupEventHandlers();
  }
  
  private setupEventHandlers(): void {
    this.pool.on('connect', (client: PoolClient) => {
      logger.debug('New database client connected');
      // Set application context for RLS
      client.query('SET app.current_user_id = $1', ['00000000-0000-0000-0000-000000000000']);
    });
    
    this.pool.on('error', (err: Error) => {
      logger.error('Database pool error:', err);
    });
    
    this.pool.on('remove', () => {
      logger.debug('Database client removed from pool');
    });
  }
  
  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }
  
  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection:', error);
      throw error;
    }
  }
  
  getPool(): Pool {
    return this.pool;
  }
  
  isReady(): boolean {
    return this.isConnected;
  }
  
  async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Query error', { text, duration, error });
      throw error;
    }
  }
  
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async setUserContext(userId: string): Promise<void> {
    await this.query('SET app.current_user_id = $1', [userId]);
  }
  
  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      await this.query('SELECT 1');
      const latency = Date.now() - start;
      return { status: 'healthy', latency };
    } catch (error) {
      const latency = Date.now() - start;
      return { status: 'unhealthy', latency };
    }
  }
}

// Export singleton instance
export const db = new DatabaseConnection();
export default db;

