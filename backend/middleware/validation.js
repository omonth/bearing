const { validationResult } = require('express-validator');
const logger = require('../logger');

function validationErrorMetadata(error) {
  const metadata = {
    type: typeof error?.type === 'string' ? error.type : 'unknown',
    message: typeof error?.msg === 'string' ? error.msg : '数据验证失败',
  };
  if (typeof error?.path === 'string') metadata.field = error.path;
  if (typeof error?.location === 'string') metadata.location = error.location;
  if (Array.isArray(error?.nestedErrors)) {
    metadata.nestedErrors = error.nestedErrors.map((nested) => (
      Array.isArray(nested)
        ? nested.map(validationErrorMetadata)
        : validationErrorMetadata(nested)
    ));
  }
  if (Array.isArray(error?.fields)) {
    metadata.fields = error.fields.map((field) => ({
      field: typeof field?.path === 'string' ? field.path : undefined,
      location: typeof field?.location === 'string' ? field.location : undefined,
    }));
  }
  return metadata;
}

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array();
    logger.warn('验证失败', {
      errors: errorDetails.map(validationErrorMetadata),
      path: req.path,
    });
    return res.status(400).json({ error: '数据验证失败', details: errorDetails });
  }
  next();
};

module.exports = { handleValidationErrors, validationErrorMetadata };
