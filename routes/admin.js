const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Rate Limiter for Login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Authentication Middleware
const requireAdmin = (req, res, next) => {
  const token = req.cookies?.admin_token;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
  }
};

// =========================================================
// AUTHENTICATION ENDPOINTS
// =========================================================

// POST /api/admin/login
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required.' });
  }

  db.get(`SELECT * FROM admins WHERE username = ?`, [username], async (err, admin) => {
    if (err || !admin) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash || admin.password);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000
    });

    return res.json({ success: true, message: 'Logged in successfully' });
  });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/admin/me
router.get('/me', requireAdmin, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// =========================================================
// PROTECTED DASHBOARD ENDPOINTS
// =========================================================

// GET /api/admin/overview
router.get('/overview', requireAdmin, (req, res) => {
  db.get(`SELECT * FROM campaign WHERE id = 1`, (err, campaign) => {
    if (err || !campaign) {
      return res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
    }

    const activeTarget = campaign.target_amount || campaign.goal_amount || 3000000;
    campaign.target_amount = activeTarget;
    campaign.goal_amount = activeTarget;

    db.get(`SELECT * FROM settings WHERE id = 1`, (err, settings) => {
      db.all(
        `SELECT d.*, dn.full_name, dn.email 
         FROM donations d 
         LEFT JOIN donors dn ON d.id = dn.donation_id 
         ORDER BY d.created_at DESC`,
        (err, donations) => {
          db.all(`SELECT * FROM referrals`, (err, referrals) => {
            res.json({ campaign, settings, donations, referrals });
          });
        }
      );
    });
  });
});

// POST /api/admin/update-goal
router.post('/update-goal', requireAdmin, (req, res) => {
  const { targetAmount } = req.body;

  if (targetAmount === undefined || targetAmount === null || targetAmount === '') {
    return res.status(400).json({ success: false, error: 'Target amount is required.' });
  }

  const numericTarget = parseFloat(targetAmount);
  if (isNaN(numericTarget) || numericTarget <= 0) {
    return res.status(400).json({ success: false, error: 'Please enter a valid numeric target amount.' });
  }

  db.run(
    `UPDATE campaign SET target_amount = ?, goal_amount = ? WHERE id = 1`,
    [numericTarget, numericTarget],
    function (err) {
      if (err) {
        console.error('Goal update DB error:', err);
        return res.status(500).json({ success: false, error: 'Database update failed.' });
      }
      res.json({ success: true, message: 'Target goal updated successfully.', newTarget: numericTarget });
    }
  );
});

// POST /api/admin/approve-donation
router.post('/approve-donation', requireAdmin, (req, res) => {
  const { donationId } = req.body;

  if (!donationId) {
    return res.status(400).json({ success: false, error: 'Donation ID is required.' });
  }

  db.run(`UPDATE donations SET status = 'COMPLETED' WHERE id = ?`, [donationId], function (err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to update donation status.' });
    }

    db.get(`SELECT amount FROM donations WHERE id = ?`, [donationId], (err, row) => {
      if (row && row.amount) {
        db.run(
          `UPDATE campaign SET raised_amount = raised_amount + ?, current_donors = current_donors + 1 WHERE id = 1`,
          [row.amount]
        );
      }
      res.json({ success: true, message: 'Donation approved and campaign stats updated.' });
    });
  });
});

// POST /api/admin/toggle-method
router.post('/toggle-method', requireAdmin, (req, res) => {
  const { method, enabled } = req.body;
  const field = method === 'wire' ? 'wire_enabled' : 'crypto_enabled';

  db.run(`UPDATE settings SET ${field} = ? WHERE id = 1`, [enabled ? 1 : 0], function (err) {
    if (err) return res.status(500).json({ success: false, error: 'Failed to update gateway settings.' });
    res.json({ success: true, message: `${method} status updated.` });
  });
});

// GET /api/admin/wire-details
router.get('/wire-details', requireAdmin, (req, res) => {
  db.get(`SELECT bank_name, account_name, account_number, swift_code, routing_number FROM settings WHERE id = 1`, [], (err, row) => {
    if (err) {
      console.error('Fetch wire details error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch wire transfer details.' });
    }
    res.json({ success: true, wireDetails: row || {} });
  });
});

// POST /api/admin/update-wire-details
router.post('/update-wire-details', requireAdmin, (req, res) => {
  const { bank_name, account_name, account_number, swift_code, routing_number } = req.body;

  if (!bank_name || !account_name || !account_number) {
    return res.status(400).json({ success: false, error: 'Bank name, account name, and account number are required.' });
  }

  db.run(
    `UPDATE settings 
     SET bank_name = ?, account_name = ?, account_number = ?, swift_code = ?, routing_number = ? 
     WHERE id = 1`,
    [bank_name, account_name, account_number, swift_code || '', routing_number || ''],
    function (err) {
      if (err) {
        console.error('Wire details update DB error:', err);
        return res.status(500).json({ success: false, error: 'Database update failed.' });
      }
      res.json({ success: true, message: 'Wire transfer details updated successfully.' });
    }
  );
});

// GET /api/admin/crypto-details
router.get('/crypto-details', requireAdmin, (req, res) => {
  db.get(`SELECT crypto_address, crypto_network FROM settings WHERE id = 1`, [], (err, row) => {
    if (err) {
      console.error('Fetch crypto details error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch crypto details.' });
    }
    res.json({ success: true, cryptoDetails: row || {} });
  });
});

// POST /api/admin/update-crypto-details
router.post('/update-crypto-details', requireAdmin, (req, res) => {
  const { crypto_address, crypto_network } = req.body;

  if (!crypto_address || !crypto_network) {
    return res.status(400).json({ success: false, error: 'Wallet address and network are required.' });
  }

  db.run(
    `UPDATE settings 
     SET crypto_address = ?, crypto_network = ? 
     WHERE id = 1`,
    [crypto_address.trim(), crypto_network.trim()],
    function (err) {
      if (err) {
        console.error('Crypto details update DB error:', err);
        return res.status(500).json({ success: false, error: 'Database update failed.' });
      }
      res.json({ success: true, message: 'Crypto details updated successfully.' });
    }
  );
});

module.exports = router;