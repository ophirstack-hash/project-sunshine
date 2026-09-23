const bcrypt = require('bcryptjs');
const db = require('./database');

const USERNAME = 'admin';
const NEW_PASSWORD = 'Adm90dnf924pfoi!';

async function setupAdmin() {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);

  // 1. Create the admins table if it does not exist
  db.run(
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        console.error('Error creating table:', err);
        process.exit(1);
      }

      // 2. Insert or update the admin account
      db.get(`SELECT * FROM admins WHERE username = ?`, [USERNAME], (err, row) => {
        if (row) {
          db.run(
            `UPDATE admins SET password_hash = ? WHERE username = ?`,
            [hash, USERNAME],
            (err) => {
              if (err) console.error('Error updating password:', err);
              else console.log(`Password for user "${USERNAME}" updated successfully!`);
              process.exit();
            }
          );
        } else {
          db.run(
            `INSERT INTO admins (username, password_hash) VALUES (?, ?)`,
            [USERNAME, hash],
            (err) => {
              if (err) console.error('Error creating admin user:', err);
              else console.log(`Admin user "${USERNAME}" created successfully!`);
              process.exit();
            }
          );
        }
      });
    }
  );
}

setupAdmin();