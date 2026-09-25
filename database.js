const { Pool } = require('pg');

// Determine if SSL is needed based on NODE_ENV or remote connection string
const isProduction = process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Handle idle client connection errors to prevent unhandled process crashes
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

// Initialize database tables using Postgres syntax
async function initDb() {
  try {
    // 1. Campaign Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign (
        id INT PRIMARY KEY DEFAULT 1,
        title TEXT,
        subtitle TEXT,
        goal_amount NUMERIC,
        target_amount NUMERIC,
        raised_amount NUMERIC DEFAULT 0,
        children_supported INT DEFAULT 0,
        current_donors INT DEFAULT 0
      );
    `);

    const campaignCheck = await pool.query('SELECT COUNT(*) FROM campaign');
    if (parseInt(campaignCheck.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO campaign (id, title, subtitle, target_amount, raised_amount, children_supported, current_donors)
        VALUES (1, 'Project Sunshine', 'Help Us Bring Hope to 50,000 Children This Holiday Season', 3000000, 0, 0, 0);
      `);
    }

    // 2. Settings Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY DEFAULT 1,
        wire_enabled INT DEFAULT 1,
        crypto_enabled INT DEFAULT 1,
        bank_name TEXT DEFAULT 'Global Commerce Bank',
        account_name TEXT DEFAULT 'Project Sunshine Foundation',
        account_number TEXT DEFAULT '1234567890',
        swift_code TEXT DEFAULT 'GCBKUS33',
        routing_number TEXT DEFAULT '021000021',
        crypto_address TEXT DEFAULT '0x1234567890abcdef1234567890abcdef12345678',
        crypto_network TEXT DEFAULT 'Base Network'
      );
    `);

    const settingsCheck = await pool.query('SELECT COUNT(*) FROM settings');
    if (parseInt(settingsCheck.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO settings (
          id, wire_enabled, crypto_enabled, 
          bank_name, account_name, account_number, swift_code, routing_number,
          crypto_address, crypto_network
        )
        VALUES (
          1, 1, 1, 
          'Global Commerce Bank', 'Project Sunshine Foundation', '1234567890', 'GCBKUS33', '021000021',
          '0x1234567890abcdef1234567890abcdef12345678', 'Base Network'
        );
      `);
    }

    // 3. Referrals Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        referrer_name TEXT NOT NULL,
        clicks INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Donations Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id TEXT PRIMARY KEY,
        amount NUMERIC NOT NULL,
        status TEXT DEFAULT 'PENDING',
        referral_code TEXT,
        payment_method TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Donors Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS donors (
        id SERIAL PRIMARY KEY,
        donation_id TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        country TEXT NOT NULL,
        zip_code TEXT
      );
    `);

    console.log('PostgreSQL tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing PostgreSQL tables:', err);
  }
}

initDb();

module.exports = pool;