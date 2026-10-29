const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/connection');

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username dan password wajib diisi' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Username atau password salah' });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return res.status(401).json({ ok: false, error: 'Username atau password salah' });
    }

    const payload = {
      id: user.id,
      username: user.username,
      nama: user.nama || user.username,
      role: user.role || 'admin'
    };

    const token = jwt.sign(payload, config.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: false, // Accessible to client-side cookie if needed
      path: '/'
    });

    return res.json({
      ok: true,
      token,
      user: payload
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.redirect('/login');
});

module.exports = router;
