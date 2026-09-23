const express = require('express');
const router = express.Router();
const db = require('../database');
const { v4: uuidv4 } = require('uuid');

// GET /api/campaign
router.get('/campaign', (req, res) => {
  db.get(`SELECT * FROM campaign WHERE id = 1`, [], (err, campaign) => {
    const campaignData = campaign || { target_amount: 3000000, raised_amount: 0, current_donors: 0 };
    const activeTarget = campaignData.target_amount || campaignData.goal_amount || 3000000;

    db.get(
      `SELECT COUNT(*) as total_donors, COALESCE(SUM(amount), 0) as total_raised 
       FROM donations 
       WHERE UPPER(status) IN ('COMPLETED', 'APPROVED')`,
      [],
      (err, stats) => {
        const liveRaised = stats ? stats.total_raised : 0;
        const liveDonors = stats ? stats.total_donors : 0;

        db.get(`SELECT * FROM settings WHERE id = 1`, [], (err, settingsRow) => {
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
        });
      }
    );
  });
});

// GET /api/settings
router.get('/settings', (req, res) => {
  db.get(`SELECT * FROM settings WHERE id = 1`, [], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }

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
  });
});

// GET /api/referral/:code
router.get('/referral/:code', (req, res) => {
  const code = req.params.code;
  db.run(`UPDATE referrals SET clicks = clicks + 1 WHERE code = ?`, [code]);
  db.get(`SELECT referrer_name FROM referrals WHERE code = ?`, [code], (err, row) => {
    if (err || !row) return res.status(404).json({ valid: false });
    res.json({ valid: true, referrerName: row.referrer_name });
  });
});

// POST /api/donate/initiate
router.post('/donate/initiate', (req, res) => {
  const { amount, referralCode } = req.body;
  const donationId = 'TRN-' + uuidv4().substring(0, 8).toUpperCase();
  
  db.run(
    `INSERT INTO donations (id, amount, status, referral_code) VALUES (?, ?, 'PENDING', ?)`,
    [donationId, amount, referralCode || null],
    function (err) {
      res.json({
        success: true,
        donationId,
        redirectUrl: `/thank-you.html?donation_id=${donationId}&amount=${amount}`
      });
    }
  );
});

// POST /api/donate/complete
router.post('/donate/complete', (req, res) => {
  const { donationId, fullName, phone, email, address, city, state, country, zipCode } = req.body;

  db.run(`UPDATE donations SET status = 'COMPLETED' WHERE id = ?`, [donationId], function () {
    db.get(`SELECT amount FROM donations WHERE id = ?`, [donationId], (err, row) => {
      if (row) {
        db.run(`UPDATE campaign SET raised_amount = raised_amount + ?, current_donors = current_donors + 1 WHERE id = 1`, [row.amount]);
      }
    });

    db.run(
      `INSERT INTO donors (donation_id, full_name, phone, email, address, city, state, country, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [donationId, fullName, phone, email, address, city, state, country, zipCode],
      function () {
        const newRefCode = fullName.split(' ')[0].toUpperCase() + Math.floor(1000 + Math.random() * 9000);
        db.run(`INSERT INTO referrals (code, referrer_name) VALUES (?, ?)`, [newRefCode, fullName]);

        res.json({
          success: true,
          donationId,
          referralCode: newRefCode,
          referralUrl: `${req.protocol}://${req.get('host')}/?r=${newRefCode}`
        });
      }
    );
  });
});

// POST /api/donate/private-submit
router.post('/donate/private-submit', (req, res) => {
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

  db.run(
    `INSERT INTO donations (id, amount, status, referral_code, payment_method) VALUES (?, ?, 'PENDING', ?, ?)`,
    [donationId, amount, referral_code || null, payment_method || 'wire'],
    function (err) {
      if (err) {
        console.error('Donation insertion error:', err);
        return res.status(500).json({ success: false, error: 'Database error recording donation.' });
      }

      db.run(
        `INSERT INTO donors (donation_id, full_name, phone, email, address, city, state, country, zip_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [donationId, full_name, phone, email, address, city, state, country, zip_code],
        function (err) {
          if (err) return res.status(500).json({ success: false, error: 'Database error recording donor details.' });

          const newRefCode = full_name.split(' ')[0].toUpperCase() + Math.floor(1000 + Math.random() * 9000);
          db.run(`INSERT INTO referrals (code, referrer_name) VALUES (?, ?)`, [newRefCode, full_name]);

          res.json({
            success: true,
            donationId,
            referralCode: newRefCode,
            referralUrl: `${req.protocol}://${req.get('host')}/?r=${newRefCode}`
          });
        }
      );
    }
  );
});

// POST /api/referral/click/:code
router.post('/referral/click/:code', (req, res) => {
  const code = req.params.code;

  db.get(`SELECT * FROM referrals WHERE code = ?`, [code], (err, referral) => {
    if (err || !referral) {
      return res.status(404).json({ error: 'Referral code not found' });
    }

    db.run(
      `UPDATE referrals SET clicks = clicks + 1 WHERE id = ?`,
      [referral.id],
      (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: 'Failed to update click count' });
        }

        res.json({
          success: true,
          referrer_name: referral.referrer_name,
          clicks: referral.clicks + 1
        });
      }
    );
  });
});

module.exports = router;