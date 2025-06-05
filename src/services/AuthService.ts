import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { db } from '../database/connection';
import { config } from '../config';
import logger from '../utils/logger';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface AuthToken {
  token: string;
  user: User;
  expires_at: string;
}

export class AuthService {
  async authenticate(apiKey: string): Promise<User | null> {
    try {
      const hashedKey = this.hashApiKey(apiKey);
      
      const query = `
        SELECT id, username, email, role, is_active, created_at, last_login
        FROM users 
        WHERE api_key_hash = $1 AND is_active = true
      `;
      
      const result = await db.query(query, [hashedKey]);
      
      if (result.rows.length === 0) {
        logger.security('invalid_api_key', { hashedKey });
        return null;
      }
      
      const user = result.rows[0];
      
      // Update last login
      await db.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );
      
      logger.info('User authenticated successfully', { userId: user.id });
      return user;
    } catch (error) {
      logger.error('Authentication error:', error);
      throw error;
    }
  }
  
  async validateJWT(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, config.security.jwtSecret) as any;
      
      const query = `
        SELECT id, username, email, role, is_active, created_at, last_login
        FROM users 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await db.query(query, [decoded.userId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      logger.security('invalid_jwt_token', { error: error.message });
      return null;
    }
  }
  
  async generateJWT(user: User): Promise<string> {
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };
    
    return jwt.sign(payload, config.security.jwtSecret, {
      expiresIn: config.security.jwtExpiresIn,
    });
  }
  
  async createUser(userData: {
    username: string;
    email: string;
    password: string;
    role?: string;
  }): Promise<User> {
    try {
      const hashedPassword = await bcrypt.hash(
        userData.password,
        config.security.bcryptRounds
      );
      
      const query = `
        INSERT INTO users (username, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, email, role, is_active, created_at
      `;
      
      const result = await db.query(query, [
        userData.username,
        userData.email,
        hashedPassword,
        userData.role || 'user',
      ]);
      
      const user = result.rows[0];
      logger.audit('user_created', 'user', user.id, user.id);
      
      return user;
    } catch (error) {
      logger.error('Create user error:', error);
      throw error;
    }
  }
  
  async generateApiKey(userId: string): Promise<string> {
    try {
      const apiKey = this.generateSecureApiKey();
      const hashedKey = this.hashApiKey(apiKey);
      
      const query = `
        UPDATE users 
        SET api_key_hash = $1
        WHERE id = $2 AND is_active = true
        RETURNING id
      `;
      
      const result = await db.query(query, [hashedKey, userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found or inactive');
      }
      
      logger.audit('api_key_generated', 'user', userId, userId);
      
      return apiKey;
    } catch (error) {
      logger.error('Generate API key error:', error);
      throw error;
    }
  }
  
  async revokeApiKey(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE users 
        SET api_key_hash = NULL
        WHERE id = $1 AND is_active = true
      `;
      
      await db.query(query, [userId]);
      
      logger.audit('api_key_revoked', 'user', userId, userId);
    } catch (error) {
      logger.error('Revoke API key error:', error);
      throw error;
    }
  }
  
  async validatePassword(userId: string, password: string): Promise<boolean> {
    try {
      const query = `
        SELECT password_hash, failed_login_attempts, locked_until
        FROM users 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return false;
      }
      
      const user = result.rows[0];
      
      // Check if account is locked
      if (user.locked_until && new Date() < new Date(user.locked_until)) {
        logger.security('account_locked_attempt', { userId });
        return false;
      }
      
      const isValid = await bcrypt.compare(password, user.password_hash);
      
      if (isValid) {
        // Reset failed attempts on successful login
        await db.query(
          'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
          [userId]
        );
      } else {
        // Increment failed attempts
        const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
        let lockUntil = null;
        
        // Lock account after 5 failed attempts for 30 minutes
        if (newFailedAttempts >= 5) {
          lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
          logger.security('account_locked', { userId, failedAttempts: newFailedAttempts });
        }
        
        await db.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [newFailedAttempts, lockUntil, userId]
        );
        
        logger.security('failed_login_attempt', { userId, failedAttempts: newFailedAttempts });
      }
      
      return isValid;
    } catch (error) {
      logger.error('Validate password error:', error);
      throw error;
    }
  }
  
  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    try {
      // Get user role
      const userQuery = `
        SELECT role FROM users WHERE id = $1 AND is_active = true
      `;
      
      const userResult = await db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        return false;
      }
      
      const role = userResult.rows[0].role;
      
      // Admin role has all permissions
      if (role === 'admin') {
        return true;
      }
      
      // Readonly role can only read
      if (role === 'readonly' && action !== 'read') {
        return false;
      }
      
      // Check specific resource permissions
      if (resource.startsWith('collection:')) {
        const collectionId = resource.split(':')[1];
        return await this.hasCollectionPermission(userId, collectionId, action);
      }
      
      // Default permission for regular users
      return role === 'user';
    } catch (error) {
      logger.error('Permission check error:', error);
      return false;
    }
  }
  
  private async hasCollectionPermission(
    userId: string,
    collectionId: string,
    action: string
  ): Promise<boolean> {
    try {
      const query = `
        SELECT cc.owner_id, cp.permission
        FROM context_collections cc
        LEFT JOIN context_permissions cp ON cc.id = cp.collection_id AND cp.user_id = $1
        WHERE cc.id = $2
      `;
      
      const result = await db.query(query, [userId, collectionId]);
      
      if (result.rows.length === 0) {
        return false;
      }
      
      const { owner_id, permission } = result.rows[0];
      
      // Owner has all permissions
      if (owner_id === userId) {
        return true;
      }
      
      // Check explicit permissions
      if (permission) {
        switch (action) {
          case 'read':
            return ['read', 'write', 'admin'].includes(permission);
          case 'write':
            return ['write', 'admin'].includes(permission);
          case 'admin':
            return permission === 'admin';
          default:
            return false;
        }
      }
      
      return false;
    } catch (error) {
      logger.error('Collection permission check error:', error);
      return false;
    }
  }
  
  private generateSecureApiKey(): string {
    // Generate a 32-byte random key and encode as base64
    return randomBytes(32).toString('base64');
  }
  
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
  
  encryptSensitiveData(data: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', config.security.apiKeyEncryptionKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }
  
  decryptSensitiveData(encryptedData: string): string {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = createDecipheriv('aes-256-cbc', config.security.apiKeyEncryptionKey, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

