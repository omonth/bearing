const { validationResult } = require('express-validator');
const logger = require('../logger');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('验证失败', { errors: errors.array(), path: req.path });
    return res.status(400).json({ error: '数据验证失败', details: errors.array() });
  }
  next();
};

module.exports = { handleValidationErrors };
