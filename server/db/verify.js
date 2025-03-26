const { pool } = require('./index');

async function verifyDatabase() {
  try {
    // Test connection
    const client = await pool.connect();
    console.log('Successfully connected to database');

    // Check if tables exist
    const tables = ['users', 'user_keys', 'messages', 'groups', 'group_members', 'group_messages'];
    
    for (const table of tables) {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      
      if (result.rows[0].exists) {
        console.log(`Table ${table} exists`);
      } else {
        console.error(`Table ${table} does not exist!`);
      }
    }

    // Check table structures
    for (const table of tables) {
      const columns = await client.query(
        `SELECT column_name, data_type 
         FROM information_schema.columns 
         WHERE table_name = $1`,
        [table]
      );
      console.log(`\nColumns in ${table}:`);
      columns.rows.forEach(col => {
        console.log(`- ${col.column_name}: ${col.data_type}`);
      });
    }

    client.release();
    console.log('\nDatabase verification completed');
  } catch (error) {
    console.error('Database verification failed:', error);
  }
}

verifyDatabase(); 