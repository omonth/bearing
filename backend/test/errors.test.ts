import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BusinessError,
} from '../utils/errors';

describe('AppError', () => {
  it('should create with default statusCode 500', () => {
    const err = new AppError('something broke');
    expect(err.message).toBe('something broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('AppError');
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('should accept custom statusCode and code', () => {
    const err = new AppError('bad request', { statusCode: 400, code: 'BAD_INPUT' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_INPUT');
    expect(err.isOperational).toBe(true);
  });
});

describe('ValidationError', () => {
  it('should have statusCode 400', () => {
    const err = new ValidationError('字段不能为空');
    expect(err.message).toBe('字段不能为空');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
    expect(err.isOperational).toBe(true);
  });

  it('should store field when provided', () => {
    const err = new ValidationError('库存不足', 'quantity');
    expect(err.field).toBe('quantity');
  });

  it('should default field to null', () => {
    const err = new ValidationError('test');
    expect(err.field).toBeNull();
  });

  it('should be instance of AppError', () => {
    const err = new ValidationError('test');
    expect(err instanceof AppError).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('should have statusCode 404 with default message', () => {
    const err = new NotFoundError();
    expect(err.message).toBe('资源不存在');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err.isOperational).toBe(true);
  });

  it('should format message with resource name', () => {
    const err = new NotFoundError('订单');
    expect(err.message).toBe('订单不存在');
  });

  it('should accept fully custom message', () => {
    const err = new NotFoundError('用户');
    expect(err.message).toBe('用户不存在');
  });

  it('should be instance of AppError', () => {
    const err = new NotFoundError();
    expect(err instanceof AppError).toBe(true);
  });
});

describe('UnauthorizedError', () => {
  it('should have statusCode 401', () => {
    const err = new UnauthorizedError();
    expect(err.message).toBe('未登录');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.isOperational).toBe(true);
  });

  it('should accept custom message', () => {
    const err = new UnauthorizedError('密码错误');
    expect(err.message).toBe('密码错误');
  });

  it('should be instance of AppError', () => {
    expect(new UnauthorizedError() instanceof AppError).toBe(true);
  });
});

describe('ForbiddenError', () => {
  it('should have statusCode 403', () => {
    const err = new ForbiddenError();
    expect(err.message).toBe('无权限');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.isOperational).toBe(true);
  });

  it('should accept custom message', () => {
    const err = new ForbiddenError('需要管理员权限');
    expect(err.message).toBe('需要管理员权限');
  });

  it('should be instance of AppError', () => {
    expect(new ForbiddenError() instanceof AppError).toBe(true);
  });
});

describe('ConflictError', () => {
  it('should have statusCode 409', () => {
    const err = new ConflictError('该手机号已存在');
    expect(err.message).toBe('该手机号已存在');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.isOperational).toBe(true);
  });

  it('should be instance of AppError', () => {
    expect(new ConflictError('dup') instanceof AppError).toBe(true);
  });
});

describe('BusinessError', () => {
  it('should have default statusCode 400', () => {
    const err = new BusinessError('库存不足');
    expect(err.message).toBe('库存不足');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BUSINESS_ERROR');
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('BusinessError');
  });

  it('should accept custom statusCode and code', () => {
    const err = new BusinessError('无法删除', 400, 'CANNOT_DELETE');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('CANNOT_DELETE');
  });

  it('should be instance of AppError', () => {
    expect(new BusinessError('test') instanceof AppError).toBe(true);
  });
});

describe('Error hierarchy chain', () => {
  it('all errors should be instanceof Error', () => {
    expect(new ValidationError('x') instanceof Error).toBe(true);
    expect(new NotFoundError() instanceof Error).toBe(true);
    expect(new UnauthorizedError() instanceof Error).toBe(true);
    expect(new ForbiddenError() instanceof Error).toBe(true);
    expect(new ConflictError('x') instanceof Error).toBe(true);
    expect(new BusinessError('x') instanceof Error).toBe(true);
  });

  it('all errors should be instanceof AppError', () => {
    expect(new ValidationError('x') instanceof AppError).toBe(true);
    expect(new NotFoundError() instanceof AppError).toBe(true);
    expect(new UnauthorizedError() instanceof AppError).toBe(true);
    expect(new ForbiddenError() instanceof AppError).toBe(true);
    expect(new ConflictError('x') instanceof AppError).toBe(true);
    expect(new BusinessError('x') instanceof AppError).toBe(true);
  });

  it('should have isOperational flag on all errors', () => {
    expect(new ValidationError('x').isOperational).toBe(true);
    expect(new NotFoundError().isOperational).toBe(true);
    expect(new UnauthorizedError().isOperational).toBe(true);
    expect(new ForbiddenError().isOperational).toBe(true);
    expect(new ConflictError('x').isOperational).toBe(true);
    expect(new BusinessError('x').isOperational).toBe(true);
  });
});
