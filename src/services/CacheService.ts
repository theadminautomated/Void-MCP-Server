import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import logger from '../utils/logger';

export class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;
  
  constructor() {
    this.client = createClient({
      url: config.cache.redisUrl,
      password: config.cache.redisPassword,
      database: config.cache.redisDb,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 20) {
            return new Error('Too many retries');
          }
          return Math.min(retries * 50, 1000);
        },
      },
    });
    
    this.setupEventHandlers();
  }
  
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });
    
    this.client.on('error', (err) => {
      logger.error('Redis client error:', err);
      this.isConnected = false;
    });
    
    this.client.on('disconnect', () => {
      logger.warn('Redis client disconnected');
      this.isConnected = false;
    });
    
    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }
  
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Cache service connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      // Don't throw - cache should be optional
    }
  }
  
  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('Cache service disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      logger.debug('Cache not available, skipping get operation');
      return null;
    }
    
    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }
  
  async set(
    key: string,
    value: any,
    ttlSeconds?: number
  ): Promise<boolean> {
    if (!this.isConnected) {
      logger.debug('Cache not available, skipping set operation');
      return false;
    }
    
    try {
      const serialized = JSON.stringify(value);
      const ttl = ttlSeconds || config.cache.ttl;
      
      if (ttl > 0) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }
  
  async del(key: string): Promise<boolean> {
    if (!this.isConnected) {
      logger.debug('Cache not available, skipping delete operation');
      return false;
    }
    
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }
  
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }
    
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }
  
  async setWithExpiry(
    key: string,
    value: any,
    expiryDate: Date
  ): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }
    
    try {
      const serialized = JSON.stringify(value);
      await this.client.expireAt(key, Math.floor(expiryDate.getTime() / 1000));
      await this.client.set(key, serialized);
      return true;
    } catch (error) {
      logger.error(`Cache setWithExpiry error for key ${key}:`, error);
      return false;
    }
  }
  
  async increment(key: string, amount: number = 1): Promise<number | null> {
    if (!this.isConnected) {
      return null;
    }
    
    try {
      const result = await this.client.incrBy(key, amount);
      return result;
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return null;
    }
  }
  
  async getMultiple<T>(keys: string[]): Promise<Record<string, T | null>> {
    if (!this.isConnected || keys.length === 0) {
      return {};
    }
    
    try {
      const values = await this.client.mGet(keys);
      const result: Record<string, T | null> = {};
      
      keys.forEach((key, index) => {
        const value = values[index];
        if (value !== null) {
          try {
            result[key] = JSON.parse(value) as T;
          } catch {
            result[key] = null;
          }
        } else {
          result[key] = null;
        }
      });
      
      return result;
    } catch (error) {
      logger.error('Cache getMultiple error:', error);
      return {};
    }
  }
  
  async setMultiple(
    keyValuePairs: Record<string, any>,
    ttlSeconds?: number
  ): Promise<boolean> {
    if (!this.isConnected || Object.keys(keyValuePairs).length === 0) {
      return false;
    }
    
    try {
      const serializedPairs: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs[key] = JSON.stringify(value);
      }
      
      await this.client.mSet(serializedPairs);
      
      // Set TTL for each key if specified
      if (ttlSeconds && ttlSeconds > 0) {
        const promises = Object.keys(keyValuePairs).map(key =>
          this.client.expire(key, ttlSeconds)
        );
        await Promise.all(promises);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache setMultiple error:', error);
      return false;
    }
  }
  
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.client.del(keys);
      return result;
    } catch (error) {
      logger.error(`Cache deletePattern error for pattern ${pattern}:`, error);
      return 0;
    }
  }
  
  async flushAll(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }
    
    try {
      await this.client.flushAll();
      return true;
    } catch (error) {
      logger.error('Cache flushAll error:', error);
      return false;
    }
  }
  
  async getStats(): Promise<any> {
    if (!this.isConnected) {
      return {
        connected: false,
        memory_usage: null,
        keyspace_info: null,
      };
    }
    
    try {
      const info = await this.client.info();
      const memoryUsage = await this.client.memoryUsage('stats');
      
      return {
        connected: true,
        info: this.parseRedisInfo(info),
        memory_usage: memoryUsage,
      };
    } catch (error) {
      logger.error('Cache getStats error:', error);
      return {
        connected: false,
        error: error.message,
      };
    }
  }
  
  private parseRedisInfo(info: string): Record<string, any> {
    const result: Record<string, any> = {};
    const sections = info.split('\r\n\r\n');
    
    for (const section of sections) {
      const lines = section.split('\r\n');
      const sectionName = lines[0]?.replace('# ', '');
      
      if (sectionName) {
        result[sectionName] = {};
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (line && line.includes(':')) {
            const [key, value] = line.split(':');
            result[sectionName][key] = isNaN(Number(value)) ? value : Number(value);
          }
        }
      }
    }
    
    return result;
  }
  
  // Cache key generation helpers
  generateSearchKey(query: string, filters: any): string {
    const filterHash = this.hashObject(filters);
    return `search:${this.hashString(query)}:${filterHash}`;
  }
  
  generateItemKey(itemId: string): string {
    return `item:${itemId}`;
  }
  
  generateCollectionKey(collectionId: string): string {
    return `collection:${collectionId}`;
  }
  
  generateUserKey(userId: string): string {
    return `user:${userId}`;
  }
  
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  private hashObject(obj: any): string {
    return this.hashString(JSON.stringify(obj));
  }
  
  isConnected(): boolean {
    return this.isConnected;
  }
}

