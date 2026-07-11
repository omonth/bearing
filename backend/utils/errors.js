/**
 * Unified error class hierarchy for the bearing-sales backend.
 *
 * All service-layer code should throw AppError subclasses.
 * Route handlers delegate to next(err) for the global error handler to format.
 *
 * Usage:
 *   throw new NotFoundError('订单');
 *   throw new ValidationError('库存不足', 'quantity');
 *   throw new ForbiddenError('无权限');
 */

class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR' } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    /** Distinguishes expected operational errors from programmer bugs. */
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  /**
   * @param {string} message - Human-readable error message
   * @param {string|null} [field=null] - The field that failed validation
   */
  constructor(message, field = null) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR' });
    this.name = 'ValidationError';
    this.field = field;
  }
}

class NotFoundError extends AppError {
  /**
   * @param {string} [resource='资源'] - The resource type that was not found
   */
  constructor(resource = '资源') {
    super(`${resource}不存在`, { statusCode: 404, code: 'NOT_FOUND' });
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '未登录') {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED' });
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = '无权限') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
    this.name = 'ForbiddenError';
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, { statusCode: 409, code: 'CONFLICT' });
    this.name = 'ConflictError';
  }
}

class BusinessError extends AppError {
  /**
   * For business rule violations that don't fit the standard categories.
   * @param {string} message
   * @param {number} [statusCode=400]
   * @param {string} [code='BUSINESS_ERROR']
   */
  constructor(message, statusCode = 400, code = 'BUSINESS_ERROR') {
    super(message, { statusCode, code });
    this.name = 'BusinessError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BusinessError,
};
