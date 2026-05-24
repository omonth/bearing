import { describe, it, expect } from 'vitest';
import { AppError, ValidationError, NotFoundError } from '../utils/errors';

describe('AppError', () => {
  it('should create with default statusCode 500', () => {
    const err = new AppError('something broke');
    expect(err.message).toBe('something broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('AppError');
    expect(err instanceof Error).toBe(true);
  });

  it('should accept custom statusCode and code', () => {
    const err = new AppError('bad request', { statusCode: 400, code: 'BAD_INPUT' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_INPUT');
  });
});

describe('ValidationError', () => {
  it('should have statusCode 400', () => {
    const err = new ValidationError('字段不能为空');
    expect(err.message).toBe('字段不能为空');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
  });

  it('should accept custom code', () => {
    const err = new ValidationError('手机号格式错误', 'INVALID_PHONE');
    expect(err.code).toBe('INVALID_PHONE');
  });

  it('should be instance of AppError', () => {
    const err = new ValidationError('test');
    expect(err instanceof AppError).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('should have statusCode 404', () => {
    const err = new NotFoundError();
    expect(err.message).toBe('资源不存在');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
  });

  it('should accept custom message', () => {
    const err = new NotFoundError('订单不存在');
    expect(err.message).toBe('订单不存在');
  });

  it('should be instance of AppError', () => {
    const err = new NotFoundError();
    expect(err instanceof AppError).toBe(true);
  });
});
