const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../database');

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
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required.' });
  }

  try {
    const result = await pool.query(`SELECT * FROM admins WHERE username = $1`, [username]);
    const admin = result.rows[0];

    if (!admin) {
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
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
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
router.get('/overview', requireAdmin, async (req, res) => {
  try {
    const campaignRes = await pool.query(`SELECT * FROM campaign WHERE id = 1`);
    const campaign = campaignRes.rows[0];

    if (!campaign) {
      return res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
    }

    const activeTarget = campaign.target_amount || campaign.goal_amount || 3000000;
    campaign.target_amount = activeTarget;
    campaign.goal_amount = activeTarget;

    const settingsRes = await pool.query(`SELECT * FROM settings WHERE id = 1`);
    const settings = settingsRes.rows[0] || {};

    const donationsRes = await pool.query(`
      SELECT d.*, dn.full_name, dn.email 
      FROM donations d 
      LEFT JOIN donors dn ON d.id = dn.donation_id 
      ORDER BY d.created_at DESC
    `);
    const donations = donationsRes.rows;

    const referralsRes = await pool.query(`SELECT * FROM referrals`);
    const referrals = referralsRes.rows;

    res.json({ campaign, settings, donations, referrals });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch overview data.' });
  }
});

// POST /api/admin/update-goal
router.post('/update-goal', requireAdmin, async (req, res) => {
  const { targetAmount } = req.body;

  if (targetAmount === undefined || targetAmount === null || targetAmount === '') {
    return res.status(400).json({ success: false, error: 'Target amount is required.' });
  }

  const numericTarget = parseFloat(targetAmount);
  if (isNaN(numericTarget) || numericTarget <= 0) {
    return res.status(400).json({ success: false, error: 'Please enter a valid numeric target amount.' });
  }

  try {
    await pool.query(
      `UPDATE campaign SET target_amount = $1, goal_amount = $2 WHERE id = 1`,
      [numericTarget, numericTarget]
    );
    res.json({ success: true, message: 'Target goal updated successfully.', newTarget: numericTarget });
  } catch (err) {
    console.error('Goal update DB error:', err);
    res.status(500).json({ success: false, error: 'Database update failed.' });
  }
});

// POST /api/admin/approve-donation
router.post('/approve-donation', requireAdmin, async (req, res) => {
  const { donationId } = req.body;

  if (!donationId) {
    return res.status(400).json({ success: false, error: 'Donation ID is required.' });
  }

  try {
    await pool.query(`UPDATE donations SET status = 'COMPLETED' WHERE id = $1`, [donationId]);

    const donationRes = await pool.query(`SELECT amount FROM donations WHERE id = $1`, [donationId]);
    const row = donationRes.rows[0];

    if (row && row.amount) {
      const numericAmount = parseFloat(row.amount);
      await pool.query(
        `UPDATE campaign SET raised_amount = raised_amount + $1, current_donors = current_donors + 1 WHERE id = 1`,
        [numericAmount]
      );
    }

    res.json({ success: true, message: 'Donation approved and campaign stats updated.' });
  } catch (err) {
    console.error('Approve donation error:', err);
    res.status(500).json({ success: false, error: 'Failed to update donation status.' });
  }
});

// POST /api/admin/toggle-method
router.post('/toggle-method', requireAdmin, async (req, res) => {
  const { method, enabled } = req.body;

  if (!['wire', 'crypto'].includes(method)) {
    return res.status(400).json({ success: false, error: 'Invalid payment method specified.' });
  }

  const field = method === 'wire' ? 'wire_enabled' : 'crypto_enabled';

  try {
    await pool.query(`UPDATE settings SET ${field} = $1 WHERE id = 1`, [enabled ? 1 : 0]);
    res.json({ success: true, message: `${method} status updated.` });
  } catch (err) {
    console.error('Toggle method error:', err);
    res.status(500).json({ success: false, error: 'Failed to update gateway settings.' });
  }
});

// GET /api/admin/wire-details
router.get('/wire-details', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bank_name, account_name, account_number, swift_code, routing_number FROM settings WHERE id = 1`
    );
    res.json({ success: true, wireDetails: result.rows[0] || {} });
  } catch (err) {
    console.error('Fetch wire details error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch wire transfer details.' });
  }
});

// POST /api/admin/update-wire-details
router.post('/update-wire-details', requireAdmin, async (req, res) => {
  const { bank_name, account_name, account_number, swift_code, routing_number } = req.body;

  if (!bank_name || !account_name || !account_number) {
    return res.status(400).json({ success: false, error: 'Bank name, account name, and account number are required.' });
  }

  try {
    await pool.query(
      `UPDATE settings 
       SET bank_name = $1, account_name = $2, account_number = $3, swift_code = $4, routing_number = $5 
       WHERE id = 1`,
      [bank_name, account_name, account_number, swift_code || '', routing_number || '']
    );
    res.json({ success: true, message: 'Wire transfer details updated successfully.' });
  } catch (err) {
    console.error('Wire details update DB error:', err);
    res.status(500).json({ success: false, error: 'Database update failed.' });
  }
});

// GET /api/admin/crypto-details
router.get('/crypto-details', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT crypto_address, crypto_network FROM settings WHERE id = 1`);
    res.json({ success: true, cryptoDetails: result.rows[0] || {} });
  } catch (err) {
    console.error('Fetch crypto details error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch crypto details.' });
  }
});

// POST /api/admin/update-crypto-details
router.post('/update-crypto-details', requireAdmin, async (req, res) => {
  const { crypto_address, crypto_network } = req.body;

  if (!crypto_address || !crypto_network) {
    return res.status(400).json({ success: false, error: 'Wallet address and network are required.' });
  }

  try {
    await pool.query(
      `UPDATE settings 
       SET crypto_address = $1, crypto_network = $2 
       WHERE id = 1`,
      [crypto_address.trim(), crypto_network.trim()]
    );
    res.json({ success: true, message: 'Crypto details updated successfully.' });
  } catch (err) {
    console.error('Crypto details update DB error:', err);
    res.status(500).json({ success: false, error: 'Database update failed.' });
  }
});

module.exports = router;