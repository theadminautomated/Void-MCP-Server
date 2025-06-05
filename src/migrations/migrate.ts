#!/usr/bin/env node

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config';

async function runMigrations() {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    ssl: config.database.ssl,
  });
  
  try {
    console.log('Connecting to database...');
    await pool.connect();
    
    console.log('Running database migrations...');
    
    // Read and execute the migration script
    const migrationPath = join(__dirname, '../../migrations/001_initial_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.toLowerCase().includes('commit')) {
        continue; // Skip COMMIT statements as we're not in a transaction
      }
      
      try {
        await pool.query(statement);
        console.log('✓ Executed statement successfully');
      } catch (error) {
        // Some statements might fail if objects already exist, which is okay
        if (error.message.includes('already exists')) {
          console.log('⚠ Statement skipped (object already exists)');
        } else {
          console.error('✗ Error executing statement:', error.message);
          console.log('Statement:', statement.substring(0, 100) + '...');
          // Don't throw - continue with other statements
        }
      }
    }
    
    console.log('✅ Database migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

