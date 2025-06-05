-- LLM Context MCP Server Database Schema
-- Enterprise-grade schema with security, auditing, and performance optimizations

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable Row Level Security
ALTER DATABASE llm_context_db SET row_security = on;

-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255) UNIQUE,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'readonly')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE
);

-- Context Collections (Groups of related contexts)
CREATE TABLE context_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(owner_id, name)
);

-- Context Items (Individual pieces of context)
CREATE TABLE context_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES context_collections(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(100) DEFAULT 'text/plain',
    source_url TEXT,
    source_type VARCHAR(100), -- 'file', 'url', 'api', 'manual'
    content_hash VARCHAR(64) UNIQUE, -- SHA-256 hash for deduplication
    size_bytes INTEGER,
    language VARCHAR(10),
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    embedding_vector vector(1536), -- OpenAI embeddings dimension
    search_vector tsvector,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Context Item Versions (Version history)
CREATE TABLE context_item_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    context_item_id UUID REFERENCES context_items(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    change_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(context_item_id, version)
);

-- Access Control
CREATE TABLE context_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID REFERENCES context_collections(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(20) CHECK (permission IN ('read', 'write', 'admin')),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    UNIQUE(collection_id, user_id)
);

-- API Usage Tracking
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Search Analytics
CREATE TABLE search_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    query TEXT NOT NULL,
    query_type VARCHAR(50), -- 'semantic', 'fulltext', 'hybrid'
    results_count INTEGER,
    execution_time_ms INTEGER,
    collection_ids UUID[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System Configuration
CREATE TABLE system_config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- Create Indexes for Performance
CREATE INDEX idx_context_items_collection_id ON context_items(collection_id);
CREATE INDEX idx_context_items_content_hash ON context_items(content_hash);
CREATE INDEX idx_context_items_created_at ON context_items(created_at DESC);
CREATE INDEX idx_context_items_tags ON context_items USING GIN(tags);
CREATE INDEX idx_context_items_metadata ON context_items USING GIN(metadata);
CREATE INDEX idx_context_items_search_vector ON context_items USING GIN(search_vector);
CREATE INDEX idx_context_items_active ON context_items(is_active) WHERE is_active = true;

CREATE INDEX idx_context_collections_owner_id ON context_collections(owner_id);
CREATE INDEX idx_context_collections_public ON context_collections(is_public) WHERE is_public = true;
CREATE INDEX idx_context_collections_tags ON context_collections USING GIN(tags);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_api_key_hash ON users(api_key_hash);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

CREATE INDEX idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at DESC);
CREATE INDEX idx_api_usage_endpoint ON api_usage(endpoint);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

CREATE INDEX idx_search_analytics_user_id ON search_analytics(user_id);
CREATE INDEX idx_search_analytics_created_at ON search_analytics(created_at DESC);

-- Triggers for Updated At
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_context_collections_updated_at BEFORE UPDATE ON context_collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_context_items_updated_at BEFORE UPDATE ON context_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for Search Vector Updates
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector = to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_context_items_search_vector 
    BEFORE INSERT OR UPDATE ON context_items
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- Row Level Security Policies
ALTER TABLE context_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can access their own collections or public ones
CREATE POLICY collections_access_policy ON context_collections
    FOR ALL
    TO public
    USING (
        owner_id = current_setting('app.current_user_id')::UUID 
        OR is_public = true 
        OR EXISTS (
            SELECT 1 FROM context_permissions cp 
            WHERE cp.collection_id = context_collections.id 
            AND cp.user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- RLS Policy: Users can access items in collections they have permission to
CREATE POLICY items_access_policy ON context_items
    FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM context_collections cc
            WHERE cc.id = context_items.collection_id
            AND (
                cc.owner_id = current_setting('app.current_user_id')::UUID
                OR cc.is_public = true
                OR EXISTS (
                    SELECT 1 FROM context_permissions cp
                    WHERE cp.collection_id = cc.id
                    AND cp.user_id = current_setting('app.current_user_id')::UUID
                )
            )
        )
    );

-- Insert default system configuration
INSERT INTO system_config (key, value, description) VALUES
    ('max_context_size', '50000', 'Maximum context size in characters'),
    ('max_collections_per_user', '100', 'Maximum collections per user'),
    ('max_items_per_collection', '10000', 'Maximum items per collection'),
    ('enable_embeddings', 'true', 'Enable vector embeddings for semantic search'),
    ('embedding_model', '"text-embedding-ada-002"', 'OpenAI embedding model to use'),
    ('rate_limit_requests_per_minute', '60', 'API rate limit per minute'),
    ('audit_retention_days', '365', 'Days to retain audit logs'),
    ('backup_enabled', 'true', 'Enable automatic backups');

-- Create default admin user (password: admin123 - CHANGE IN PRODUCTION!)
INSERT INTO users (username, email, password_hash, role) VALUES
    ('admin', 'admin@localhost', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewgKTTjF8FeKb5a2', 'admin');

COMMIT;

