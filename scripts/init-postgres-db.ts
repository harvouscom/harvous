/**
 * Initialize PostgreSQL Database
 * 
 * Runs the PostgreSQL schema SQL to set up the database for self-hosted mode
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('Connecting to PostgreSQL...');
  const sql = postgres(databaseUrl);

  try {
    // Read schema file
    const schemaPath = join(process.cwd(), 'db', 'postgres-schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    console.log('Executing schema...');
    // Execute schema (split by semicolons for individual statements)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (!error.message?.includes('already exists')) {
          console.error('Error executing statement:', error.message);
          console.error('Statement:', statement.substring(0, 100));
        }
      }
    }

    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

initDatabase();

