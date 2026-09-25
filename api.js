const express = require('express');
const router = express.Router();
const pool = require('../database');
const { randomUUID: uuidv4 } = require('crypto');

// GET /api/campaign
router.get('/campaign', async (req, res) => {
  try {
    const campaignRes = await pool.query(`SELECT * FROM campaign WHERE id = 1`);
    const campaignData = campaignRes.rows[0] || { target_amount: 3000000, raised_amount: 0, current_donors: 0 };
    const activeTarget = campaignData.target_amount || campaignData.goal_amount || 3000000;

    const statsRes = await pool.query(`
      SELECT COUNT(*) as total_donors, COALESCE(SUM(amount), 0) as total_raised 
      FROM donations 
      WHERE UPPER(status) IN ('COMPLETED', 'APPROVED')
    `);
    const stats = statsRes.rows[0];
    const liveRaised = stats ? parseFloat(stats.total_raised) : 0;
    const liveDonors = stats ? parseInt(stats.total_donors, 10) : 0;

    const settingsRes = await pool.query(`SELECT * FROM settings WHERE id = 1`);
    const settingsRow = settingsRes.rows[0];

    const settings = {
      wire_enabled: settingsRow ? Boolean(settingsRow.wire_enabled) : true,
      crypto_enabled: settingsRow ? Boolean(settingsRow.crypto_enabled) : true,
      wire_details: {
        bank_name: settingsRow?.bank_name || '',
        account_name: settingsRow?.account_name || '',
        account_number: settingsRow?.account_number || '',
        swift_code: settingsRow?.swift_code || '',
        routing_number: settingsRow?.routing_number || ''
      },
      crypto_details: {
        crypto_address: settingsRow?.crypto_address || '',
        crypto_network: settingsRow?.crypto_network || ''
      }
    };

    res.json({
      success: true,
      raised_amount: liveRaised,
      target_amount: activeTarget,
      goal_amount: activeTarget,
      current_donors: liveDonors,
      donor_count: liveDonors,
      settings: settings
    });
  } catch (err) {
    console.error('Fetch campaign error:', err);
    res.status(500).json({ success: false, error: 'Database error fetching campaign.' });
  }
});

// GET /api/settings
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM settings WHERE id = 1`);
    const row = result.rows[0];

    const settings = {
      wire_enabled: row ? Boolean(row.wire_enabled) : true,
      crypto_enabled: row ? Boolean(row.crypto_enabled) : true,
      wire_details: {
        bank_name: row?.bank_name || '',
        account_name: row?.account_name || '',
        account_number: row?.account_number || '',
        swift_code: row?.swift_code || '',
        routing_number: row?.routing_number || ''
      },
      crypto_details: {
        crypto_address: row?.crypto_address || '',
        crypto_network: row?.crypto_network || ''
      }
    };

    res.json({ success: true, settings });
  } catch (err) {
    console.error('Fetch settings error:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// GET /api/referral/:code
router.get('/referral/:code', async (req, res) => {
  const code = req.params.code;
  try {
    await pool.query(`UPDATE referrals SET clicks = clicks + 1 WHERE code = $1`, [code]);
    const result = await pool.query(`SELECT referrer_name FROM referrals WHERE code = $1`, [code]);
    const row = result.rows[0];

    if (!row) return res.status(404).json({ valid: false });
    res.json({ valid: true, referrerName: row.referrer_name });
  } catch (err) {
    console.error('Referral check error:', err);
    res.status(500).json({ valid: false });
  }
});

// POST /api/donate/initiate
router.post('/donate/initiate', async (req, res) => {
  const { amount, referralCode } = req.body;
  const donationId = 'TRN-' + uuidv4().substring(0, 8).toUpperCase();

  try {
    await pool.query(
      `INSERT INTO donations (id, amount, status, referral_code) VALUES ($1, $2, 'PENDING', $3)`,
      [donationId, amount, referralCode || null]
    );

    res.json({
      success: true,
      donationId,
      redirectUrl: `/thank-you.html?donation_id=${donationId}&amount=${amount}`
    });
  } catch (err) {
    console.error('Initiate donation error:', err);
    res.status(500).json({ success: false, error: 'Failed to initiate donation.' });
  }
});

// POST /api/donate/complete
router.post('/donate/complete', async (req, res) => {
  const { donationId, fullName, phone, email, address, city, state, country, zipCode } = req.body;

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

    await pool.query(
      `INSERT INTO donors (donation_id, full_name, phone, email, address, city, state, country, zip_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [donationId, fullName, phone, email, address, city, state, country, zipCode]
    );

    const firstName = (fullName || 'DONOR').trim().split(/\s+/)[0];
    const newRefCode = firstName.toUpperCase() + Math.floor(1000 + Math.random() * 9000);
    await pool.query(`INSERT INTO referrals (code, referrer_name) VALUES ($1, $2)`, [newRefCode, fullName]);

    res.json({
      success: true,
      donationId,
      referralCode: newRefCode,
      referralUrl: `${req.protocol}://${req.get('host')}/?r=${newRefCode}`
    });
  } catch (err) {
    console.error('Complete donation error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete donation.' });
  }
});

// POST /api/donate/private-submit
router.post('/donate/private-submit', async (req, res) => {
  const {
    amount,
    full_name,
    email,
    phone,
    address,
    city,
    state,
    country,
    zip_code,
    payment_method,
    system_reference,
    referral_code
  } = req.body;

  if (!amount || !full_name || !email) {
    return res.status(400).json({ success: false, error: 'Missing required donor fields.' });
  }

  const donationId = system_reference || ('TRN-' + uuidv4().substring(0, 8).toUpperCase());

  try {
    await pool.query(
      `INSERT INTO donations (id, amount, status, referral_code, payment_method) VALUES ($1, $2, 'PENDING', $3, $4)`,
      [donationId, amount, referral_code || null, payment_method || 'wire']
    );

    await pool.query(
      `INSERT INTO donors (donation_id, full_name, phone, email, address, city, state, country, zip_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [donationId, full_name, phone, email, address, city, state, country, zip_code]
    );

    const firstName = (full_name || 'DONOR').trim().split(/\s+/)[0];
    const newRefCode = firstName.toUpperCase() + Math.floor(1000 + Math.random() * 9000);
    await pool.query(`INSERT INTO referrals (code, referrer_name) VALUES ($1, $2)`, [newRefCode, full_name]);

    res.json({
      success: true,
      donationId,
      referralCode: newRefCode,
      referralUrl: `${req.protocol}://${req.get('host')}/?r=${newRefCode}`
    });
  } catch (err) {
    console.error('Private submit donation error:', err);
    res.status(500).json({ success: false, error: 'Database error recording donation.' });
  }
});

// POST /api/referral/click/:code
router.post('/referral/click/:code', async (req, res) => {
  const code = req.params.code;

  try {
    const refRes = await pool.query(`SELECT * FROM referrals WHERE code = $1`, [code]);
    const referral = refRes.rows[0];

    if (!referral) {
      return res.status(404).json({ error: 'Referral code not found' });
    }

    await pool.query(`UPDATE referrals SET clicks = clicks + 1 WHERE id = $1`, [referral.id]);

    res.json({
      success: true,
      referrer_name: referral.referrer_name,
      clicks: referral.clicks + 1
    });
  } catch (err) {
    console.error('Referral click update error:', err);
    res.status(500).json({ error: 'Failed to update click count' });
  }
});

module.exports = router;