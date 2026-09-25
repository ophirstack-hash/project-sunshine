const bcrypt = require('bcryptjs');
const { pool } = require('./database'); // Destructure pool

const USERNAME = 'creator1985';
const NEW_PASSWORD = process.env.ADMIN_PASSWORD || 'Adm90dnf924pfoi!';

async function setupAdmin() {
  try {
    const hash = await bcrypt.hash(NEW_PASSWORD, 10);

    // 1. Create admins table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )
    `);

    // 2. Insert or update admin user
    const checkRes = await pool.query(`SELECT * FROM admins WHERE username = $1`, [USERNAME]);

    if (checkRes.rows.length > 0) {
      await pool.query(`UPDATE admins SET password_hash = $1 WHERE username = $2`, [hash, USERNAME]);
      console.log(`Password for user "${USERNAME}" updated successfully!`);
    } else {
      await pool.query(`INSERT INTO admins (username, password_hash) VALUES ($1, $2)`, [USERNAME, hash]);
      console.log(`Admin user "${USERNAME}" created successfully!`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error seeding admin user:', err);
    process.exit(1);
  }
}

setupAdmin();