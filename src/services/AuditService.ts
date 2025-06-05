import { db } from '../database/connection';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export class AuditService {
  async logAction(
    action: string,
    resourceType: string,
    resourceId?: string,
    userId?: string,
    oldValues?: any,
    newValues?: any,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id, 
          old_values, new_values, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      
      await db.query(query, [
        userId,
        action,
        resourceType,
        resourceId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        metadata?.ip_address,
        metadata?.user_agent,
      ]);
      
      // Also log to structured logger
      logger.audit(action, resourceType, resourceId || '', userId, {
        old_values: oldValues,
        new_values: newValues,
        metadata,
      });
    } catch (error) {
      logger.error('Failed to log audit entry:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }
  
  async logToolCall(
    toolName: string,
    args: any,
    userId?: string,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
      execution_time_ms?: number;
      result_size?: number;
    }
  ): Promise<void> {
    try {
      await this.logAction(
        'tool_call',
        'mcp_tool',
        toolName,
        userId,
        null,
        {
          tool_name: toolName,
          arguments: args,
          execution_time_ms: metadata?.execution_time_ms,
          result_size: metadata?.result_size,
        },
        {
          ip_address: metadata?.ip_address,
          user_agent: metadata?.user_agent,
        }
      );
    } catch (error) {
      logger.error('Failed to log tool call:', error);
    }
  }
  
  async logDataChange(
    action: 'create' | 'update' | 'delete',
    resourceType: string,
    resourceId: string,
    oldValues: any,
    newValues: any,
    userId?: string,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<void> {
    try {
      await this.logAction(
        `${resourceType}_${action}`,
        resourceType,
        resourceId,
        userId,
        oldValues,
        newValues,
        metadata
      );
    } catch (error) {
      logger.error('Failed to log data change:', error);
    }
  }
  
  async logSecurityEvent(
    event: string,
    details: any,
    userId?: string,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<void> {
    try {
      await this.logAction(
        'security_event',
        'security',
        event,
        userId,
        null,
        details,
        metadata
      );
      
      // Also log as security event
      logger.security(event, details);
    } catch (error) {
      logger.error('Failed to log security event:', error);
    }
  }
  
  async getAuditLog(
    filters: {
      user_id?: string;
      action?: string;
      resource_type?: string;
      resource_id?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    logs: AuditLogEntry[];
    total: number;
  }> {
    try {
      let whereClause = '1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      if (filters.user_id) {
        whereClause += ` AND user_id = $${paramIndex}`;
        queryParams.push(filters.user_id);
        paramIndex++;
      }
      
      if (filters.action) {
        whereClause += ` AND action = $${paramIndex}`;
        queryParams.push(filters.action);
        paramIndex++;
      }
      
      if (filters.resource_type) {
        whereClause += ` AND resource_type = $${paramIndex}`;
        queryParams.push(filters.resource_type);
        paramIndex++;
      }
      
      if (filters.resource_id) {
        whereClause += ` AND resource_id = $${paramIndex}`;
        queryParams.push(filters.resource_id);
        paramIndex++;
      }
      
      if (filters.start_date) {
        whereClause += ` AND created_at >= $${paramIndex}`;
        queryParams.push(filters.start_date);
        paramIndex++;
      }
      
      if (filters.end_date) {
        whereClause += ` AND created_at <= $${paramIndex}`;
        queryParams.push(filters.end_date);
        paramIndex++;
      }
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM audit_logs
        WHERE ${whereClause}
      `;
      
      const countResult = await db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);
      
      // Get paginated results
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;
      
      const dataQuery = `
        SELECT 
          id, user_id, action, resource_type, resource_id,
          old_values, new_values, ip_address, user_agent, created_at
        FROM audit_logs
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      queryParams.push(limit, offset);
      
      const dataResult = await db.query(dataQuery, queryParams);
      
      return {
        logs: dataResult.rows,
        total,
      };
    } catch (error) {
      logger.error('Failed to get audit log:', error);
      throw error;
    }
  }
  
  async getAuditStats(
    timeframe: '24h' | '7d' | '30d' | '90d' = '7d'
  ): Promise<{
    total_actions: number;
    actions_by_type: Array<{ action: string; count: number }>;
    actions_by_user: Array<{ user_id: string; count: number }>;
    actions_by_hour: Array<{ hour: string; count: number }>;
  }> {
    try {
      let interval: string;
      switch (timeframe) {
        case '24h':
          interval = '24 hours';
          break;
        case '7d':
          interval = '7 days';
          break;
        case '30d':
          interval = '30 days';
          break;
        case '90d':
          interval = '90 days';
          break;
        default:
          interval = '7 days';
      }
      
      const whereClause = `WHERE created_at >= NOW() - INTERVAL '${interval}'`;
      
      // Total actions
      const totalQuery = `
        SELECT COUNT(*) as total
        FROM audit_logs
        ${whereClause}
      `;
      
      const totalResult = await db.query(totalQuery);
      const total_actions = parseInt(totalResult.rows[0].total);
      
      // Actions by type
      const actionTypesQuery = `
        SELECT action, COUNT(*) as count
        FROM audit_logs
        ${whereClause}
        GROUP BY action
        ORDER BY count DESC
        LIMIT 20
      `;
      
      const actionTypesResult = await db.query(actionTypesQuery);
      
      // Actions by user
      const userActionsQuery = `
        SELECT user_id, COUNT(*) as count
        FROM audit_logs
        ${whereClause}
        AND user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY count DESC
        LIMIT 20
      `;
      
      const userActionsResult = await db.query(userActionsQuery);
      
      // Actions by hour
      const hourlyQuery = `
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as count
        FROM audit_logs
        ${whereClause}
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
        LIMIT 24
      `;
      
      const hourlyResult = await db.query(hourlyQuery);
      
      return {
        total_actions,
        actions_by_type: actionTypesResult.rows.map(row => ({
          action: row.action,
          count: parseInt(row.count),
        })),
        actions_by_user: userActionsResult.rows.map(row => ({
          user_id: row.user_id,
          count: parseInt(row.count),
        })),
        actions_by_hour: hourlyResult.rows.map(row => ({
          hour: row.hour,
          count: parseInt(row.count),
        })),
      };
    } catch (error) {
      logger.error('Failed to get audit stats:', error);
      throw error;
    }
  }
  
  async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    try {
      const query = `
        DELETE FROM audit_logs
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `;
      
      const result = await db.query(query);
      const deletedCount = result.rowCount || 0;
      
      logger.info('Audit log cleanup completed', {
        retention_days: retentionDays,
        deleted_count: deletedCount,
      });
      
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup audit logs:', error);
      throw error;
    }
  }
}

