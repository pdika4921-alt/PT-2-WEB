const express = require('express');
const router = express.Router();
const config = require('../config');
const { PAGES, getGrantedPages, issueGrant } = require('../middleware/gate');

function safeNext(url, fallback) {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return url;
  }
  return fallback;
}

router.get('/', (req, res) => {
  const page = PAGES[req.query.page] ? req.query.page : 'valid4';
  const meta = PAGES[page];
  const next = safeNext(req.query.next, meta.path);

  if (getGrantedPages(req).includes(page)) {
    return res.redirect(next);
  }
  res.render('akses', { page, meta, next, error: null, title: `Akses ${meta.label}` });
});

router.post('/', (req, res) => {
  const page = PAGES[req.body.page] ? req.body.page : 'valid4';
  const meta = PAGES[page];
  const next = safeNext(req.body.next, meta.path);
  const password = (req.body.password || '').trim();

  if (password && password === config.ACCESS_PASSWORD) {
    // Satu password benar -> buka ketiga halaman (VALID 4, Rekon PT 2, Rekon Freelance)
    issueGrant(res, [...Object.keys(PAGES)]);
    return res.redirect(next);
  }

  res.status(401).render('akses', {
    page,
    meta,
    next,
    error: 'Password salah. Silakan coba lagi.',
    title: `Akses ${meta.label}`
  });
});

module.exports = router;
