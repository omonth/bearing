const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.get('/', (req, res) => {
  res.json({ message: '轴承销售系统 API', version: '5.1.0' });
});

module.exports = router;
