const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function resetDatabase() {
  let pool;
  try {
    // First connect to postgres database to create/drop our database
    pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: 'postgres',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 5432
    });

    // Terminate existing connections
    await pool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'chat_app'
      AND pid <> pg_backend_pid();
    `);

    // Drop and recreate database
    await pool.query('DROP DATABASE IF EXISTS chat_app');
    await pool.query('CREATE DATABASE chat_app');
    await pool.end();

    // Connect to the new database and create schema
    pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: 'chat_app',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 5432
    });

    // Read and execute schema.sql
    const schemaSQL = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schemaSQL);
    
    console.log('Database reset completed successfully');
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

resetDatabase(); 