const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  BusinessError,
  NotFoundError,
  ValidationError,
} = require('../utils/errors');
const {
  createDefaultCustomerNotificationSender,
} = require('./customerNotificationSender');

const PURPOSE = Object.freeze({
  PASSWORD_RESET: 'password_reset',
  PHONE_VERIFICATION: 'phone_verification',
});
const GENERIC_RECOVERY_RESPONSE = Object.freeze({
  message: '如果该手机号已注册，您将收到密码重置通知',
});

function validatePassword(password) {
  if (typeof password !== 'string'
    || password.length < 8
    || Buffer.byteLength(password, 'utf8') > 72
    || !/[A-Za-z]/.test(password)
    || !/\d/.test(password)) {
    throw new ValidationError('密码必须为 8 至 72 字节，并同时包含字母和数字', 'newPassword');
  }
}

function normalizePhone(phone) {
  const normalized = typeof phone === 'string' ? phone.trim() : '';
  return /^1[3-9]\d{9}$/.test(normalized) ? normalized : null;
}

class CustomerSecurityService {
  constructor({
    db,
    notificationSender,
    pepper,
    environment = process.env,
    now = () => Math.floor(Date.now() / 1000),
    requestCooldownSeconds = 60,
    maxRequestsPerHour = 5,
    resetTtlSeconds = 15 * 60,
    verificationTtlSeconds = 10 * 60,
    verificationAttempts = 5,
  }) {
    if (!db) throw new Error('CustomerSecurityService requires a database');
    const configuredPepper = pepper || environment.CUSTOMER_SECURITY_PEPPER;
    if (configuredPepper && (typeof configuredPepper !== 'string' || configuredPepper.length < 32)) {
      throw new Error('CUSTOMER_SECURITY_PEPPER must contain at least 32 characters');
    }
    if (!configuredPepper && environment.NODE_ENV === 'production') {
      throw new Error('Production customer security flows require a strong CUSTOMER_SECURITY_PEPPER');
    }
    this.db = db;
    this.notificationSender = notificationSender || createDefaultCustomerNotificationSender(environment);
    this.pepper = configuredPepper || crypto.randomBytes(32).toString('hex');
    this.now = now;
    this.requestCooldownSeconds = requestCooldownSeconds;
    this.maxRequestsPerHour = maxRequestsPerHour;
    this.resetTtlSeconds = resetTtlSeconds;
    this.verificationTtlSeconds = verificationTtlSeconds;
    this.verificationAttempts = verificationAttempts;
  }

  subjectKey(phone) {
    return crypto.createHmac('sha256', this.pepper).update(`phone:${phone}`).digest('hex');
  }

  secretHash(purpose, secret) {
    return crypto.createHmac('sha256', this.pepper).update(`${purpose}:${secret}`).digest('hex');
  }

  async createChallenge({ customerId, phone, purpose, secret, ttlSeconds, attempts }) {
    const now = this.now();
    const subjectKey = this.subjectKey(phone);
    const secretHash = this.secretHash(purpose, secret);

    return this.db.transaction(async (tx) => {
      const recent = await tx.get(
        `SELECT COUNT(*) AS count, MAX(created_at_epoch) AS latest
         FROM customer_security_challenges
         WHERE purpose = ? AND subject_key = ? AND created_at_epoch >= ?`,
        [purpose, subjectKey, now - 60 * 60]
      );
      if (Number(recent?.count || 0) >= this.maxRequestsPerHour
        || (recent?.latest != null && now - Number(recent.latest) < this.requestCooldownSeconds)) {
        return { issued: false, rateLimited: true };
      }

      await tx.run(
        `UPDATE customer_security_challenges
         SET consumed_at = ?
         WHERE purpose = ? AND subject_key = ? AND consumed_at IS NULL`,
        [now, purpose, subjectKey]
      );
      const result = await tx.run(
        `INSERT INTO customer_security_challenges
          (customer_id, purpose, subject_key, secret_hash, expires_at,
           attempts_remaining, created_at_epoch)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [customerId || null, purpose, subjectKey, secretHash, now + ttlSeconds, attempts, now]
      );
      return {
        issued: true,
        challengeId: result.lastID,
        expiresAt: now + ttlSeconds,
        subjectKey,
      };
    });
  }

  async consumeChallenge(challengeId) {
    await this.db.run(
      'UPDATE customer_security_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
      [this.now(), challengeId]
    );
  }

  async requestPasswordReset({ phone }) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return GENERIC_RECOVERY_RESPONSE;

    const customer = await this.db.get(
      'SELECT id FROM customers WHERE phone = ? AND status = ?',
      [normalizedPhone, 'active']
    );
    const secret = crypto.randomBytes(32).toString('base64url');
    const challenge = await this.createChallenge({
      customerId: customer?.id,
      phone: normalizedPhone,
      purpose: PURPOSE.PASSWORD_RESET,
      secret,
      ttlSeconds: this.resetTtlSeconds,
      attempts: 1,
    });

    if (challenge.issued && customer) {
      Promise.resolve()
        .then(() => this.notificationSender.send({
          kind: PURPOSE.PASSWORD_RESET,
          destination: normalizedPhone,
          secret,
          expiresAt: challenge.expiresAt,
          delivery: {
            path: '/login',
            credentialLocation: 'fragment',
            fragmentParameter: 'resetToken',
          },
        }))
        .catch(() => this.consumeChallenge(challenge.challengeId))
        .catch(() => {});
    }
    return GENERIC_RECOVERY_RESPONSE;
  }

  async resetPassword({ token, newPassword }) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
      throw new BusinessError('重置凭证无效或已过期', 400, 'INVALID_OR_EXPIRED_RESET');
    }
    validatePassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const tokenHash = this.secretHash(PURPOSE.PASSWORD_RESET, token);
    const now = this.now();

    await this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const challenge = await tx.get(
        `SELECT id, customer_id, subject_key, expires_at, consumed_at
         FROM customer_security_challenges
         WHERE purpose = ? AND secret_hash = ?${lockClause}`,
        [PURPOSE.PASSWORD_RESET, tokenHash]
      );
      if (!challenge || !challenge.customer_id || challenge.consumed_at != null
        || Number(challenge.expires_at) < now) {
        throw new BusinessError('重置凭证无效或已过期', 400, 'INVALID_OR_EXPIRED_RESET');
      }

      const consumed = await tx.run(
        `UPDATE customer_security_challenges SET consumed_at = ?
         WHERE id = ? AND consumed_at IS NULL AND expires_at >= ?`,
        [now, challenge.id, now]
      );
      if (!consumed || consumed.changes !== 1) {
        throw new BusinessError('重置凭证无效或已过期', 400, 'INVALID_OR_EXPIRED_RESET');
      }
      const updated = await tx.run(
        `UPDATE customers SET password = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ?`,
        [passwordHash, challenge.customer_id, 'active']
      );
      if (!updated || updated.changes !== 1) {
        throw new BusinessError('重置凭证无效或已过期', 400, 'INVALID_OR_EXPIRED_RESET');
      }
      await tx.run(
        `UPDATE customer_security_challenges SET consumed_at = ?
         WHERE customer_id = ? AND purpose = ? AND consumed_at IS NULL`,
        [now, challenge.customer_id, PURPOSE.PASSWORD_RESET]
      );
    });
    return { message: '密码已重置' };
  }

  async isPhoneVerified(executor, customerId, subjectKey) {
    const record = await executor.get(
      `SELECT verified_at FROM customer_phone_verifications
       WHERE customer_id = ? AND subject_key = ?`,
      [customerId, subjectKey]
    );
    return record ? Number(record.verified_at) : null;
  }

  async requestPhoneVerification(customerId) {
    const customer = await this.db.get(
      'SELECT id, phone, status, phone_verified_at FROM customers WHERE id = ?',
      [customerId]
    );
    if (!customer || customer.status !== 'active') throw new NotFoundError('顾客');
    if (customer.phone_verified_at != null) {
      return {
        verified: true,
        verifiedAt: Number(customer.phone_verified_at),
        idempotent: true,
      };
    }
    const subjectKey = this.subjectKey(customer.phone);
    const verifiedAt = await this.isPhoneVerified(this.db, customer.id, subjectKey);
    if (verifiedAt) {
      await this.db.run(
        'UPDATE customers SET phone_verified_at = ? WHERE id = ? AND phone_verified_at IS NULL',
        [verifiedAt, customer.id]
      );
      return { verified: true, verifiedAt, idempotent: true };
    }

    const secret = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challenge = await this.createChallenge({
      customerId: customer.id,
      phone: customer.phone,
      purpose: PURPOSE.PHONE_VERIFICATION,
      secret,
      ttlSeconds: this.verificationTtlSeconds,
      attempts: this.verificationAttempts,
    });
    if (!challenge.issued) {
      throw new BusinessError('验证码请求过于频繁，请稍后再试', 429, 'SECURITY_REQUEST_RATE_LIMITED');
    }

    try {
      await this.notificationSender.send({
        kind: PURPOSE.PHONE_VERIFICATION,
        destination: customer.phone,
        secret,
        expiresAt: challenge.expiresAt,
      });
    } catch {
      await this.consumeChallenge(challenge.challengeId);
      throw new BusinessError('验证码发送暂时不可用', 503, 'NOTIFICATION_UNAVAILABLE');
    }
    return { verified: false, notificationRequested: true };
  }

  async confirmPhoneVerification(customerId, code) {
    if (!/^\d{6}$/.test(typeof code === 'string' ? code : '')) {
      throw new ValidationError('验证码格式无效', 'code');
    }
    const now = this.now();
    const result = await this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const customer = await tx.get(
        `SELECT id, phone, status, phone_verified_at
         FROM customers WHERE id = ?${lockClause}`,
        [customerId]
      );
      if (!customer || customer.status !== 'active') throw new NotFoundError('顾客');
      if (customer.phone_verified_at != null) {
        return {
          verified: true,
          verifiedAt: Number(customer.phone_verified_at),
          idempotent: true,
        };
      }
      const subjectKey = this.subjectKey(customer.phone);
      const verifiedAt = await this.isPhoneVerified(tx, customer.id, subjectKey);
      if (verifiedAt) {
        await tx.run(
          'UPDATE customers SET phone_verified_at = ? WHERE id = ? AND phone_verified_at IS NULL',
          [verifiedAt, customer.id]
        );
        return { verified: true, verifiedAt, idempotent: true };
      }

      const challenge = await tx.get(
        `SELECT id, secret_hash, expires_at, attempts_remaining
         FROM customer_security_challenges
         WHERE customer_id = ? AND purpose = ? AND subject_key = ? AND consumed_at IS NULL
         ORDER BY id DESC LIMIT 1${lockClause}`,
        [customer.id, PURPOSE.PHONE_VERIFICATION, subjectKey]
      );
      if (!challenge || Number(challenge.expires_at) < now
        || Number(challenge.attempts_remaining) <= 0) {
        if (challenge) {
          await tx.run(
            'UPDATE customer_security_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
            [now, challenge.id]
          );
        }
        return { error: 'INVALID_OR_EXPIRED_CODE' };
      }

      const expected = Buffer.from(challenge.secret_hash, 'hex');
      const supplied = Buffer.from(this.secretHash(PURPOSE.PHONE_VERIFICATION, code), 'hex');
      if (!crypto.timingSafeEqual(expected, supplied)) {
        const remaining = Number(challenge.attempts_remaining) - 1;
        await tx.run(
          `UPDATE customer_security_challenges
           SET attempts_remaining = ?, consumed_at = CASE WHEN ? = 0 THEN ? ELSE consumed_at END
           WHERE id = ? AND consumed_at IS NULL`,
          [remaining, remaining, now, challenge.id]
        );
        return { error: 'INVALID_OR_EXPIRED_CODE' };
      }

      const consumed = await tx.run(
        `UPDATE customer_security_challenges SET consumed_at = ?, attempts_remaining = 0
         WHERE id = ? AND consumed_at IS NULL AND expires_at >= ?`,
        [now, challenge.id, now]
      );
      if (!consumed || consumed.changes !== 1) {
        return { error: 'INVALID_OR_EXPIRED_CODE' };
      }
      await tx.run(
        `INSERT INTO customer_phone_verifications
          (customer_id, subject_key, verified_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(customer_id) DO UPDATE SET
           subject_key = excluded.subject_key,
           verified_at = excluded.verified_at,
           updated_at = excluded.updated_at`,
        [customer.id, subjectKey, now, now]
      );
      const verifiedCustomer = await tx.run(
        `UPDATE customers
         SET phone_verified_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND phone_verified_at IS NULL`,
        [now, customer.id]
      );
      if (!verifiedCustomer || verifiedCustomer.changes !== 1) {
        throw new BusinessError('手机号验证状态保存失败', 500, 'PHONE_VERIFICATION_STATE_FAILED');
      }
      return { verified: true, verifiedAt: now, idempotent: false };
    });
    if (result.error) {
      throw new BusinessError('验证码无效或已过期', 400, result.error);
    }
    return result;
  }
}

CustomerSecurityService.GENERIC_RECOVERY_RESPONSE = GENERIC_RECOVERY_RESPONSE;
CustomerSecurityService.PURPOSE = PURPOSE;
CustomerSecurityService.normalizePhone = normalizePhone;
CustomerSecurityService.validatePassword = validatePassword;

module.exports = CustomerSecurityService;
