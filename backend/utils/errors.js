class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR' } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message, { statusCode: 400, code });
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = '资源不存在', code = 'NOT_FOUND') {
    super(message, { statusCode: 404, code });
    this.name = 'NotFoundError';
  }
}

module.exports = { AppError, ValidationError, NotFoundError };
