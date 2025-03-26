const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'chat_app',
  password: process.env.DB_PASSWORD || 'root',
  port: process.env.DB_PORT || 5432,
});

async function runSQLFile(filename) {
  try {
    const sql = await fs.readFile(path.join(__dirname, filename), 'utf8');
    await pool.query(sql);
    console.log(`Successfully executed ${filename}`);
  } catch (error) {
    console.error(`Error executing ${filename}:`, error);
  }
}

async function updateDatabase() {
  try {
    await runSQLFile('fix_messages.sql');
    console.log('Database update completed');
  } catch (error) {
    console.error('Database update failed:', error);
  } finally {
    await pool.end();
  }
}

updateDatabase();
