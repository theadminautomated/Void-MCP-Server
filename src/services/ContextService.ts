import { db } from '../database/connection';
import logger from '../utils/logger';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface SearchParams {
  query: string;
  collection_ids?: string[];
  search_type: 'semantic' | 'fulltext' | 'hybrid';
  limit: number;
  tags?: string[];
}

export interface CreateItemParams {
  collection_id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  source_type: string;
  tags: string[];
  metadata: Record<string, any>;
}

export interface UpdateItemParams {
  item_id: string;
  title?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  change_summary?: string;
}

export interface ListCollectionsParams {
  include_public: boolean;
  tags?: string[];
  limit: number;
  offset: number;
}

export interface CreateCollectionParams {
  name: string;
  description?: string;
  is_public: boolean;
  tags: string[];
  metadata: Record<string, any>;
}

export interface AnalyticsParams {
  type: 'search' | 'usage' | 'performance';
  start_date?: string;
  end_date?: string;
  collection_ids?: string[];
}

export class ContextService {
  async searchContext(params: SearchParams, userId?: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      if (userId) {
        await db.setUserContext(userId);
      }
      
      let query: string;
      let queryParams: any[];
      
      switch (params.search_type) {
        case 'fulltext':
          query = this.buildFullTextQuery(params);
          queryParams = this.buildFullTextParams(params);
          break;
        case 'semantic':
          // For semantic search, you would typically use vector similarity
          // For now, we'll use a placeholder that falls back to full-text
          query = this.buildSemanticQuery(params);
          queryParams = this.buildSemanticParams(params);
          break;
        case 'hybrid':
        default:
          query = this.buildHybridQuery(params);
          queryParams = this.buildHybridParams(params);
          break;
      }
      
      const result = await db.query(query, queryParams);
      
      const duration = Date.now() - startTime;
      
      // Log search analytics
      await this.logSearchAnalytics({
        user_id: userId,
        query: params.query,
        query_type: params.search_type,
        results_count: result.rows.length,
        execution_time_ms: duration,
        collection_ids: params.collection_ids || [],
      });
      
      return {
        items: result.rows,
        total: result.rows.length,
        query_type: params.search_type,
        execution_time_ms: duration,
      };
    } catch (error) {
      logger.error('Search context error:', error);
      throw error;
    }
  }
  
  private buildFullTextQuery(params: SearchParams): string {
    let whereClause = 'ci.search_vector @@ plainto_tsquery($1)';
    let joinClause = '';
    let orderClause = 'ORDER BY ts_rank(ci.search_vector, plainto_tsquery($1)) DESC';
    
    if (params.collection_ids && params.collection_ids.length > 0) {
      whereClause += ' AND ci.collection_id = ANY($2)';
    }
    
    if (params.tags && params.tags.length > 0) {
      const tagIndex = params.collection_ids ? 3 : 2;
      whereClause += ` AND ci.tags && $${tagIndex}`;
    }
    
    return `
      SELECT 
        ci.id,
        ci.title,
        ci.content,
        ci.content_type,
        ci.source_url,
        ci.source_type,
        ci.tags,
        ci.metadata,
        ci.created_at,
        ci.updated_at,
        cc.name as collection_name,
        ts_rank(ci.search_vector, plainto_tsquery($1)) as relevance_score
      FROM context_items ci
      JOIN context_collections cc ON ci.collection_id = cc.id
      WHERE ci.is_active = true AND ${whereClause}
      ${orderClause}
      LIMIT $${params.tags ? (params.collection_ids ? 4 : 3) : (params.collection_ids ? 3 : 2)}
    `;
  }
  
  private buildFullTextParams(params: SearchParams): any[] {
    const queryParams = [params.query];
    
    if (params.collection_ids && params.collection_ids.length > 0) {
      queryParams.push(params.collection_ids);
    }
    
    if (params.tags && params.tags.length > 0) {
      queryParams.push(params.tags);
    }
    
    queryParams.push(params.limit);
    return queryParams;
  }
  
  private buildSemanticQuery(params: SearchParams): string {
    // Placeholder for semantic search - in a real implementation,
    // you would use vector similarity with embeddings
    return this.buildFullTextQuery(params);
  }
  
  private buildSemanticParams(params: SearchParams): any[] {
    return this.buildFullTextParams(params);
  }
  
  private buildHybridQuery(params: SearchParams): string {
    // Combine full-text and semantic search
    return this.buildFullTextQuery(params);
  }
  
  private buildHybridParams(params: SearchParams): any[] {
    return this.buildFullTextParams(params);
  }
  
  async getContextItem(itemId: string, includeVersions: boolean, userId?: string): Promise<any> {
    try {
      if (userId) {
        await db.setUserContext(userId);
      }
      
      const itemQuery = `
        SELECT 
          ci.id,
          ci.title,
          ci.content,
          ci.content_type,
          ci.source_url,
          ci.source_type,
          ci.tags,
          ci.metadata,
          ci.version,
          ci.created_at,
          ci.updated_at,
          ci.created_by,
          ci.updated_by,
          cc.name as collection_name,
          cc.id as collection_id
        FROM context_items ci
        JOIN context_collections cc ON ci.collection_id = cc.id
        WHERE ci.id = $1 AND ci.is_active = true
      `;
      
      const itemResult = await db.query(itemQuery, [itemId]);
      
      if (itemResult.rows.length === 0) {
        throw new Error(`Context item not found: ${itemId}`);
      }
      
      const item = itemResult.rows[0];
      
      if (includeVersions) {
        const versionsQuery = `
          SELECT 
            id,
            version,
            title,
            content,
            metadata,
            change_summary,
            created_at,
            created_by
          FROM context_item_versions
          WHERE context_item_id = $1
          ORDER BY version DESC
        `;
        
        const versionsResult = await db.query(versionsQuery, [itemId]);
        item.versions = versionsResult.rows;
      }
      
      return item;
    } catch (error) {
      logger.error('Get context item error:', error);
      throw error;
    }
  }
  
  async createContextItem(params: CreateItemParams, userId?: string): Promise<any> {
    try {
      const contentHash = createHash('sha256').update(params.content).digest('hex');
      
      return await db.transaction(async (client) => {
        if (userId) {
          await client.query('SET app.current_user_id = $1', [userId]);
        }
        
        // Check for duplicate content
        const duplicateCheck = await client.query(
          'SELECT id FROM context_items WHERE content_hash = $1 AND is_active = true',
          [contentHash]
        );
        
        if (duplicateCheck.rows.length > 0) {
          throw new Error('Duplicate content detected');
        }
        
        // Verify collection exists and user has permission
        const collectionCheck = await client.query(
          'SELECT id FROM context_collections WHERE id = $1',
          [params.collection_id]
        );
        
        if (collectionCheck.rows.length === 0) {
          throw new Error('Collection not found');
        }
        
        const itemId = uuidv4();
        
        const insertQuery = `
          INSERT INTO context_items (
            id, collection_id, title, content, content_type, 
            source_url, source_type, content_hash, size_bytes,
            tags, metadata, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
          RETURNING *
        `;
        
        const result = await client.query(insertQuery, [
          itemId,
          params.collection_id,
          params.title,
          params.content,
          params.content_type,
          params.source_url,
          params.source_type,
          contentHash,
          Buffer.byteLength(params.content, 'utf8'),
          params.tags,
          JSON.stringify(params.metadata),
          userId,
        ]);
        
        // Create initial version
        await client.query(`
          INSERT INTO context_item_versions (
            context_item_id, version, title, content, metadata, created_by
          ) VALUES ($1, 1, $2, $3, $4, $5)
        `, [
          itemId,
          params.title,
          params.content,
          JSON.stringify(params.metadata),
          userId,
        ]);
        
        return result.rows[0];
      });
    } catch (error) {
      logger.error('Create context item error:', error);
      throw error;
    }
  }
  
  async updateContextItem(params: UpdateItemParams, userId?: string): Promise<any> {
    try {
      return await db.transaction(async (client) => {
        if (userId) {
          await client.query('SET app.current_user_id = $1', [userId]);
        }
        
        // Get current item
        const currentResult = await client.query(
          'SELECT * FROM context_items WHERE id = $1 AND is_active = true',
          [params.item_id]
        );
        
        if (currentResult.rows.length === 0) {
          throw new Error('Context item not found');
        }
        
        const currentItem = currentResult.rows[0];
        const newVersion = currentItem.version + 1;
        
        // Build update query dynamically
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 2;
        
        if (params.title !== undefined) {
          updates.push(`title = $${paramIndex}`);
          values.push(params.title);
          paramIndex++;
        }
        
        if (params.content !== undefined) {
          updates.push(`content = $${paramIndex}`);
          values.push(params.content);
          paramIndex++;
          
          const newContentHash = createHash('sha256').update(params.content).digest('hex');
          updates.push(`content_hash = $${paramIndex}`);
          values.push(newContentHash);
          paramIndex++;
          
          updates.push(`size_bytes = $${paramIndex}`);
          values.push(Buffer.byteLength(params.content, 'utf8'));
          paramIndex++;
        }
        
        if (params.tags !== undefined) {
          updates.push(`tags = $${paramIndex}`);
          values.push(params.tags);
          paramIndex++;
        }
        
        if (params.metadata !== undefined) {
          updates.push(`metadata = $${paramIndex}`);
          values.push(JSON.stringify(params.metadata));
          paramIndex++;
        }
        
        updates.push(`version = $${paramIndex}`);
        values.push(newVersion);
        paramIndex++;
        
        updates.push(`updated_by = $${paramIndex}`);
        values.push(userId);
        paramIndex++;
        
        if (updates.length === 0) {
          throw new Error('No updates provided');
        }
        
        const updateQuery = `
          UPDATE context_items 
          SET ${updates.join(', ')}
          WHERE id = $1
          RETURNING *
        `;
        
        const result = await client.query(updateQuery, [params.item_id, ...values]);
        
        // Create version record
        await client.query(`
          INSERT INTO context_item_versions (
            context_item_id, version, title, content, metadata, 
            change_summary, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          params.item_id,
          newVersion,
          params.title || currentItem.title,
          params.content || currentItem.content,
          JSON.stringify(params.metadata || currentItem.metadata),
          params.change_summary,
          userId,
        ]);
        
        return result.rows[0];
      });
    } catch (error) {
      logger.error('Update context item error:', error);
      throw error;
    }
  }
  
  async listCollections(params: ListCollectionsParams, userId?: string): Promise<any> {
    try {
      if (userId) {
        await db.setUserContext(userId);
      }
      
      let whereClause = '1=1';
      let queryParams: any[] = [];
      let paramIndex = 1;
      
      if (params.tags && params.tags.length > 0) {
        whereClause += ` AND tags && $${paramIndex}`;
        queryParams.push(params.tags);
        paramIndex++;
      }
      
      const query = `
        SELECT 
          cc.id,
          cc.name,
          cc.description,
          cc.is_public,
          cc.tags,
          cc.metadata,
          cc.created_at,
          cc.updated_at,
          COUNT(ci.id) as item_count
        FROM context_collections cc
        LEFT JOIN context_items ci ON cc.id = ci.collection_id AND ci.is_active = true
        WHERE ${whereClause}
        GROUP BY cc.id
        ORDER BY cc.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      queryParams.push(params.limit, params.offset);
      
      const result = await db.query(query, queryParams);
      
      return {
        collections: result.rows,
        total: result.rows.length,
        limit: params.limit,
        offset: params.offset,
      };
    } catch (error) {
      logger.error('List collections error:', error);
      throw error;
    }
  }
  
  async createCollection(params: CreateCollectionParams, userId?: string): Promise<any> {
    try {
      if (userId) {
        await db.setUserContext(userId);
      }
      
      const query = `
        INSERT INTO context_collections (
          name, description, owner_id, is_public, tags, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const result = await db.query(query, [
        params.name,
        params.description,
        userId,
        params.is_public,
        params.tags,
        JSON.stringify(params.metadata),
      ]);
      
      return result.rows[0];
    } catch (error) {
      logger.error('Create collection error:', error);
      throw error;
    }
  }
  
  async getAnalytics(params: AnalyticsParams, userId?: string): Promise<any> {
    try {
      if (userId) {
        await db.setUserContext(userId);
      }
      
      switch (params.type) {
        case 'search':
          return await this.getSearchAnalytics(params);
        case 'usage':
          return await this.getUsageAnalytics(params);
        case 'performance':
          return await this.getPerformanceAnalytics(params);
        default:
          throw new Error(`Unknown analytics type: ${params.type}`);
      }
    } catch (error) {
      logger.error('Get analytics error:', error);
      throw error;
    }
  }
  
  private async getSearchAnalytics(params: AnalyticsParams): Promise<any> {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as search_count,
        AVG(execution_time_ms) as avg_execution_time,
        AVG(results_count) as avg_results_count
      FROM search_analytics
      WHERE created_at >= COALESCE($1::date, NOW() - INTERVAL '30 days')
        AND created_at <= COALESCE($2::date, NOW())
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    const result = await db.query(query, [params.start_date, params.end_date]);
    return { search_analytics: result.rows };
  }
  
  private async getUsageAnalytics(params: AnalyticsParams): Promise<any> {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time,
        COUNT(DISTINCT user_id) as unique_users
      FROM api_usage
      WHERE created_at >= COALESCE($1::date, NOW() - INTERVAL '30 days')
        AND created_at <= COALESCE($2::date, NOW())
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    const result = await db.query(query, [params.start_date, params.end_date]);
    return { usage_analytics: result.rows };
  }
  
  private async getPerformanceAnalytics(params: AnalyticsParams): Promise<any> {
    const query = `
      SELECT 
        endpoint,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time,
        MIN(response_time_ms) as min_response_time,
        MAX(response_time_ms) as max_response_time
      FROM api_usage
      WHERE created_at >= COALESCE($1::date, NOW() - INTERVAL '7 days')
        AND created_at <= COALESCE($2::date, NOW())
      GROUP BY endpoint
      ORDER BY avg_response_time DESC
    `;
    
    const result = await db.query(query, [params.start_date, params.end_date]);
    return { performance_analytics: result.rows };
  }
  
  async getSchemaInfo(): Promise<any> {
    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `;
    
    const result = await db.query(query);
    return { schema: result.rows };
  }
  
  async healthCheck(): Promise<any> {
    return await db.healthCheck();
  }
  
  private async logSearchAnalytics(data: any): Promise<void> {
    try {
      await db.query(`
        INSERT INTO search_analytics (
          user_id, query, query_type, results_count, 
          execution_time_ms, collection_ids
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        data.user_id,
        data.query,
        data.query_type,
        data.results_count,
        data.execution_time_ms,
        data.collection_ids,
      ]);
    } catch (error) {
      logger.error('Failed to log search analytics:', error);
      // Don't throw - analytics logging should not break the main operation
    }
  }
}

