const jwt = require('jsonwebtoken');
const config = require('../config');

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const cookies = parseCookies(req);
  return cookies.token || null;
}

function userContext(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      req.user = decoded;
      res.locals.user = decoded;
    } catch (e) {
      req.user = null;
      res.locals.user = null;
    }
  } else {
    req.user = null;
    res.locals.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ ok: false, error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    res.locals.user = decoded;
    next();
  } catch (err) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid token' });
  }
}

function requireWebhookSecret(req, res, next) {
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== config.WEBHOOK_SECRET) {
    return res.status(403).json({ ok: false, error: 'Forbidden: Invalid webhook secret' });
  }
  next();
}

module.exports = {
  extractToken,
  userContext,
  requireAuth,
  requireWebhookSecret
};
