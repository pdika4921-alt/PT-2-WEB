const express = require('express');
const router = express.Router();
const { requireWebhookSecret } = require('../middleware/auth');
const { handleFormWebhook, handleBastCallback } = require('../controllers/webhookController');

router.post('/form', requireWebhookSecret, handleFormWebhook);
router.post('/bast-callback', handleBastCallback);

module.exports = router;
