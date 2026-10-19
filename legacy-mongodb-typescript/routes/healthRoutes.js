const express = require('express');
const { getHealthStatus } = require('../controllers/healthController');

const router = express.Router();

// GET /api/health
router.get('/', getHealthStatus);

module.exports = router;
