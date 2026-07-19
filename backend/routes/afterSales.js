const express = require('express');
const {
  createAdminTokenVerifier,
  createCustomerTokenVerifier,
  requireAdmin,
} = require('../middleware/auth');
const { ValidationError } = require('../utils/errors');

function requireCustomer(req, res, next) {
  if (req.user?.role !== 'customer') {
    return res.status(403).json({ error: '需要顾客身份', code: 'FORBIDDEN' });
  }
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

module.exports = function createAfterSalesRoutes(afterSalesService) {
  if (!afterSalesService) throw new Error('售后服务未配置');
  const router = express.Router();
  const customerAuth = [
    createCustomerTokenVerifier(afterSalesService.db, { requireVerifiedPhone: true }),
    requireCustomer,
  ];
  const adminAuth = [createAdminTokenVerifier(afterSalesService.db), requireAdmin];

  router.post('/cases', ...customerAuth, asyncRoute(async (req, res) => {
    const headerKey = req.get('Idempotency-Key');
    if (headerKey && req.body.clientRequestId && headerKey !== req.body.clientRequestId) {
      throw new ValidationError(
        'Idempotency-Key 与 clientRequestId 不一致',
        'clientRequestId'
      );
    }
    const data = await afterSalesService.createCase(req.user.userId, {
      ...req.body,
      clientRequestId: headerKey || req.body.clientRequestId,
    });
    res.status(data.idempotent ? 200 : 201).json({ data });
  }));

  router.get('/cases', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.listCasesForCustomer(req.user.userId);
    res.json({ data });
  }));

  router.get('/cases/:id', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.getCaseForCustomer(req.user.userId, req.params.id);
    res.json({ data });
  }));

  router.post('/cases/:id/cancel', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.cancelCaseForCustomer(
      req.user.userId,
      req.params.id,
      req.body.expectedVersion
    );
    res.json({ data });
  }));

  router.get('/orders/:orderId/logistics', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.getLogisticsForCustomer(
      req.user.userId,
      req.params.orderId
    );
    res.json({ data });
  }));

  router.get('/invoice-profiles', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.listInvoiceProfiles(req.user.userId);
    res.json({ data });
  }));

  router.post('/invoice-profiles', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.createInvoiceProfile(req.user.userId, req.body);
    res.status(201).json({ data });
  }));

  router.patch('/invoice-profiles/:id', ...customerAuth, asyncRoute(async (req, res) => {
    const { expectedVersion, ...input } = req.body;
    const data = await afterSalesService.updateInvoiceProfile({
      customerId: req.user.userId,
      profileId: req.params.id,
      expectedVersion,
      input,
    });
    res.json({ data });
  }));

  router.delete('/invoice-profiles/:id', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.deleteInvoiceProfile({
      customerId: req.user.userId,
      profileId: req.params.id,
      expectedVersion: req.body?.expectedVersion || req.query.version,
    });
    res.json({ data });
  }));

  router.post('/orders/:orderId/invoices', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.requestOrderInvoice({
      customerId: req.user.userId,
      orderId: req.params.orderId,
      profileId: req.body.profileId,
    });
    res.status(201).json({ data });
  }));

  router.get('/invoices', ...customerAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.listOrderInvoices(req.user.userId);
    res.json({ data });
  }));

  router.get('/admin/cases', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.listCasesForAdmin({
      status: req.query.status,
      type: req.query.type,
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 20,
    });
    res.json({ data });
  }));

  router.get('/admin/cases/:id', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.getCaseForAdmin(req.params.id);
    res.json({ data });
  }));

  router.patch('/admin/cases/:id/status', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.updateCaseStatus({
      caseId: req.params.id,
      expectedVersion: req.body.expectedVersion,
      status: req.body.status,
      adminId: req.user.userId,
      note: req.body.note,
    });
    res.json({ data });
  }));

  router.post('/admin/cases/:id/refund', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.initiateRefund({
      caseId: req.params.id,
      expectedVersion: req.body.expectedVersion,
      adminId: req.user.userId,
      note: req.body.note,
    });
    res.json({ data });
  }));

  router.post('/admin/cases/:id/refund/sync', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.syncRefundStatus({
      caseId: req.params.id,
      expectedVersion: req.body.expectedVersion,
      adminId: req.user.userId,
    });
    res.json({ data });
  }));

  router.post('/admin/cases/:id/refund/manual', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.resolveManualRefund({
      caseId: req.params.id,
      expectedVersion: req.body.expectedVersion,
      adminId: req.user.userId,
      resolution: req.body.resolution,
      evidence: req.body.evidence,
      externalReference: req.body.externalReference,
    });
    res.json({ data });
  }));

  router.get('/admin/invoices', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.listInvoicesForAdmin({
      status: req.query.status,
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 20,
    });
    res.json({ data });
  }));

  router.get('/admin/invoices/:id', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.getInvoiceForAdmin(req.params.id);
    res.json({ data });
  }));

  router.patch('/admin/invoices/:id/status', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.updateInvoiceStatus({
      invoiceId: req.params.id,
      expectedVersion: req.body.expectedVersion,
      status: req.body.status,
      adminId: req.user.userId,
      note: req.body.note,
      invoiceNumber: req.body.invoiceNumber,
    });
    res.json({ data });
  }));

  router.get('/admin/orders/:orderId/logistics', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.getLogisticsForAdmin(req.params.orderId);
    res.json({ data });
  }));

  router.put('/admin/orders/:orderId/logistics', ...adminAuth, asyncRoute(async (req, res) => {
    const data = await afterSalesService.updateLogisticsForAdmin({
      orderId: req.params.orderId,
      expectedVersion: req.body.expectedVersion,
      adminId: req.user.userId,
      carrier: req.body.carrier,
      trackingNumber: req.body.trackingNumber,
      status: req.body.status,
      location: req.body.location,
      note: req.body.note,
    });
    res.json({ data });
  }));

  return router;
};
