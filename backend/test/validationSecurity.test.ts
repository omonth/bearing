import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { body } from 'express-validator';
import request from 'supertest';

const logger = require('../logger');
const { handleValidationErrors } = require('../middleware/validation');

describe('validation logging security', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs validation metadata without newPassword or addressDetail values', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const app = express();
    app.use(express.json());
    app.post('/validate', [
      body('newPassword').custom(() => {
        throw new Error('密码强度不足');
      }),
      body('addressDetail').custom(() => {
        throw new Error('地址格式无效');
      }),
      handleValidationErrors,
    ], (_req, res) => res.json({ data: true }));
    const newPassword = 'Customer-secret-123';
    const addressDetail = '北京市海淀区中关村大街完整门牌地址';

    await request(app)
      .post('/validate')
      .send({ newPassword, addressDetail })
      .expect(400);

    expect(warn).toHaveBeenCalledTimes(1);
    const metadata = warn.mock.calls[0][1];
    expect(metadata).toEqual({
      errors: [
        { field: 'newPassword', location: 'body', message: '密码强度不足', type: 'field' },
        { field: 'addressDetail', location: 'body', message: '地址格式无效', type: 'field' },
      ],
      path: '/validate',
    });
    expect(JSON.stringify(metadata)).not.toContain(newPassword);
    expect(JSON.stringify(metadata)).not.toContain(addressDetail);
  });
});
