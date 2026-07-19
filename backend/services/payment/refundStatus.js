const RefundStatus = Object.freeze({
  REQUESTED: 'requested',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  MANUAL_REQUIRED: 'manual_required',
});

const refundStatuses = new Set(Object.values(RefundStatus));
const activeRefundStatuses = [
  RefundStatus.REQUESTED,
  RefundStatus.PROCESSING,
  RefundStatus.SUCCESS,
  RefundStatus.MANUAL_REQUIRED,
];

module.exports = { RefundStatus, activeRefundStatuses, refundStatuses };
