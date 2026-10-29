const jwt = require('jsonwebtoken');
const config = require('../config');

const PAGES = {
  valid4: { label: 'VALID 4', path: '/valid4' },
  rekon: { label: 'Rekon PT 2', path: '/rekon' },
  'rekon-freelance': { label: 'Rekon Freelance', path: '/rekon-freelance' }
};

const GRANT_MAX_AGE = 12 * 60 * 60 * 1000; // 12 jam

function getGrantedPages(req) {
  const token = req.cookies && req.cookies.page_grant;
  if (!token) return [];
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    return Array.isArray(decoded.pages) ? decoded.pages : [];
  } catch (e) {
    return [];
  }
}

function issueGrant(res, pages) {
  const unique = [...new Set(pages)].filter(p => PAGES[p]);
  const token = jwt.sign({ pages: unique }, config.JWT_SECRET, { expiresIn: '12h' });
  res.cookie('page_grant', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: GRANT_MAX_AGE
  });
}

function requirePageAccess(pageKey) {
  return (req, res, next) => {
    if (getGrantedPages(req).includes(pageKey)) return next();

    if (req.accepts('html')) {
      const target = encodeURIComponent(req.originalUrl);
      return res.redirect(`/akses?page=${pageKey}&next=${target}`);
    }
    return res.status(403).json({ ok: false, error: 'Forbidden: halaman dilindungi password akses' });
  };
}

module.exports = { PAGES, getGrantedPages, issueGrant, requirePageAccess };
