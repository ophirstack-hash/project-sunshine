const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'trannity.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Campaign Table
  db.run(`
    CREATE TABLE IF NOT EXISTS campaign (
      id INTEGER PRIMARY KEY DEFAULT 1,
      title TEXT,
      subtitle TEXT,
      goal_amount REAL,
      target_amount REAL,
      raised_amount REAL,
      children_supported INTEGER,
      current_donors INTEGER
    )
  `);

  db.get(`SELECT COUNT(*) as count FROM campaign`, (err, row) => {
    if (row && row.count === 0) {
      db.run(`
        INSERT INTO campaign (id, title, subtitle, target_amount, raised_amount, children_supported, current_donors)
VALUES (1, 'Project Sunshine', 'Help Us Bring Hope to 50,000 Children This Holiday Season', 3000000, 0, 0, 0)
      `);
    }
  });

// Settings Table (Updated with Wire and Crypto Details)
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    wire_enabled INTEGER DEFAULT 1,
    crypto_enabled INTEGER DEFAULT 1,
    bank_name TEXT DEFAULT 'Global Commerce Bank',
    account_name TEXT DEFAULT 'Project Sunshine Foundation',
    account_number TEXT DEFAULT '1234567890',
    swift_code TEXT DEFAULT 'GCBKUS33',
    routing_number TEXT DEFAULT '021000021',
    crypto_address TEXT DEFAULT '0x1234567890abcdef1234567890abcdef12345678',
    crypto_network TEXT DEFAULT 'Base Network'
  )
`);

db.get(`SELECT COUNT(*) as count FROM settings`, (err, row) => {
  if (row && row.count === 0) {
    db.run(`
      INSERT INTO settings (
        id, wire_enabled, crypto_enabled, 
        bank_name, account_name, account_number, swift_code, routing_number,
        crypto_address, crypto_network
      )
      VALUES (
        1, 1, 1, 
        'Global Commerce Bank', 'Project Sunshine Foundation', '1234567890', 'GCBKUS33', '021000021',
        '0x1234567890abcdef1234567890abcdef12345678', 'Base Network'
      )
    `);
  }
});



  // 3. Referrals Table
  db.run(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      referrer_name TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Donations Table
  db.run(`
    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'PENDING',
      referral_code TEXT,
      payment_method TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. Donors Table
  db.run(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      donation_id TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL,
      zip_code TEXT
    )
  `);
});

module.exports = db;