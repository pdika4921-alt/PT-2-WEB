const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');

router.get('/proxy-image', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('URL query parameter is required');
  }

  // Google Drive conversion
  if (imageUrl.includes('drive.google.com') && imageUrl.includes('/d/')) {
    const match = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return res.redirect(`https://lh3.googleusercontent.com/d/${match[1]}`);
    }
  }

  if (imageUrl.includes('drive.google.com') && imageUrl.includes('id=')) {
    const match = imageUrl.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return res.redirect(`https://lh3.googleusercontent.com/d/${match[1]}`);
    }
  }

  // If already full http(s) URL
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const client = imageUrl.startsWith('https') ? https : http;
    client.get(imageUrl, (streamRes) => {
      if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        return res.redirect(streamRes.headers.location);
      }
      res.setHeader('Content-Type', streamRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      streamRes.pipe(res);
    }).on('error', (err) => {
      console.warn('Proxy image error:', err.message);
      res.status(502).send('Error streaming image');
    });
  } else {
    // Relative upload url
    return res.redirect(imageUrl);
  }
});

module.exports = router;
