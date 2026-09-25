const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// 1. Import initDb from database module
const { initDb } = require('./database');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Enable trust proxy for Render reverse proxy (fixes express-rate-limit error)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Protect the static admin page before express.static executes
app.get('/admin.html', (req, res) => {
  const token = req.cookies?.admin_token;
  if (!token) {
    return res.redirect('/admin-login.html');
  }
  try {
    jwt.verify(token, JWT_SECRET);
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } catch (err) {
    res.redirect('/admin-login.html');
  }
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Serve static HTML/CSS/JS files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for root or unknown paths
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. Bind to 0.0.0.0 and execute initDb() on startup
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Trannity] Server running on port ${PORT}`);
  initDb();
});