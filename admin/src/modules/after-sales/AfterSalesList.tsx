import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Input,
  message,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import {
  getAfterSalesCase,
  initiateAfterSalesRefund,
  listAfterSalesCases,
  parseAfterSalesApiError,
  syncAfterSalesRefund,
  updateAfterSalesStatus,
} from './afterSalesApi';
import {
  afterSalesStatusColors,
  afterSalesStatusLabels,
  afterSalesTypeLabels,
  availableStatusTransitions,
  canInitiateRefund,
  canSyncRefund,
  maskSensitiveText,
  refundStatusLabels,
  statusSuccessMessage,
} from './afterSalesModel';
import type {
  AfterSalesCase,
  AfterSalesDetail,
  AfterSalesStatus,
  AfterSalesType,
} from './types';

const PAGE_SIZE = 20;

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

function formatMoney(value: number | null) {
  return value === null ? '-' : `¥${value.toFixed(2)}`;
}

export default function AfterSalesList() {
  const [items, setItems] = useState<AfterSalesCase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AfterSalesStatus | undefined>();
  const [type, setType] = useState<AfterSalesType | undefined>();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<AfterSalesDetail | null>(null);
  const [targetStatus, setTargetStatus] = useState<AfterSalesStatus | undefined>();
  const [note, setNote] = useState('');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAfterSalesCases({ status, type, page, pageSize: PAGE_SIZE });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      message.error(parseAfterSalesApiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [page, status, type]);

  const loadDetail = useCallback(async (caseId: number) => {
    setDetailLoading(true);
    try {
      const result = await getAfterSalesCase(caseId);
      setDetail(result);
      const transitions = availableStatusTransitions(result);
      setTargetStatus(transitions[0]);
      return result;
    } catch (error) {
      message.error(parseAfterSalesApiError(error).message);
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchCases(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchCases]);

  const transitions = useMemo(
    () => detail ? availableStatusTransitions(detail) : [],
    [detail],
  );

  const openDetail = async (item: AfterSalesCase) => {
    setDrawerOpen(true);
    setConflictNotice(null);
    setNote('');
    await loadDetail(item.id);
  };

  const refreshAfterAction = async (caseId: number) => {
    await Promise.all([fetchCases(), loadDetail(caseId)]);
  };

  const handleActionError = async (error: unknown, caseId: number) => {
    const failure = parseAfterSalesApiError(error);
    if (failure.status === 409) {
      setConflictNotice(failure.versionConflict
        ? '该售后单已被其他管理员更新，已加载最新版本，请核对后重试。'
        : failure.message);
      await refreshAfterAction(caseId);
      return;
    }
    message.error(failure.message);
  };

  const submitStatus = async () => {
    if (!detail || !targetStatus) return;
    if (note.trim().length < 2) {
      message.warning('请填写至少 2 个字符的处理说明');
      return;
    }
    setActionLoading(true);
    setConflictNotice(null);
    try {
      const updated = await updateAfterSalesStatus(detail.id, {
        status: targetStatus,
        expectedVersion: detail.version,
        note: note.trim(),
      });
      message.success(statusSuccessMessage(updated));
      setNote('');
      await refreshAfterAction(detail.id);
    } catch (error) {
      await handleActionError(error, detail.id);
    } finally {
      setActionLoading(false);
    }
  };

  const submitRefund = async () => {
    if (!detail) return;
    if (note.trim().length < 2) {
      message.warning('请填写至少 2 个字符的退款处理说明');
      return;
    }
    setActionLoading(true);
    setConflictNotice(null);
    try {
      await initiateAfterSalesRefund(detail.id, {
        expectedVersion: detail.version,
        note: note.trim(),
      });
      message.success('退款请求已提交统一支付流程，请等待渠道确认或按人工处理状态跟进');
      setNote('');
      await refreshAfterAction(detail.id);
    } catch (error) {
      await handleActionError(error, detail.id);
    } finally {
      setActionLoading(false);
    }
  };

  const syncRefund = async () => {
    if (!detail) return;
    setActionLoading(true);
    setConflictNotice(null);
    try {
      const updated = await syncAfterSalesRefund(detail.id, detail.version);
      message.success(updated.refundStatus === 'success'
        ? '退款状态已由统一支付流程确认为成功'
        : `退款状态已同步：${updated.refundStatus
          ? refundStatusLabels[updated.refundStatus]
          : '尚未返回结果'}`);
      await refreshAfterAction(detail.id);
    } catch (error) {
      await handleActionError(error, detail.id);
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnsType<AfterSalesCase> = [
    {
      title: '售后单号',
      dataIndex: 'caseNo',
      width: 210,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: '订单',
      dataIndex: 'orderId',
      width: 90,
      render: (value: number | null) => value === null ? '-' : `#${value}`,
    },
    {
      title: '顾客',
      dataIndex: 'customerId',
      width: 90,
      render: (value: number) => `#${value}`,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 130,
      render: (value: AfterSalesType) => afterSalesTypeLabels[value],
    },
    {
      title: '原因',
      dataIndex: 'reason',
      ellipsis: true,
      render: (value: string | null) => maskSensitiveText(value),
    },
    {
      title: '申请金额',
      dataIndex: 'requestedAmount',
      width: 110,
      render: (value: number | null) => formatMoney(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 180,
      render: (value: AfterSalesStatus) => (
        <Tag color={afterSalesStatusColors[value]}>{afterSalesStatusLabels[value]}</Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: formatDate,
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      fixed: 'right',
      render: (_, item) => (
        <Button
          type="link"
          size="small"
          data-testid={`after-sales-detail-${item.id}`}
          onClick={() => void openDetail(item)}
        >
          详情/审核
        </Button>
      ),
    },
  ];

  const handlePagination = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1);
  };

  return (
    <div data-testid="admin-after-sales-page">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-200">售后管理</h1>
          <p className="text-sm text-neutral-500 mt-1">
            审核通过后退款仍处于待处理状态；最终结果以统一支付流程和支付渠道确认状态为准。
          </p>
        </div>
        <Button onClick={() => void fetchCases()} loading={loading}>刷新</Button>
      </div>

      <Space wrap className="mb-4">
        <Select
          data-testid="after-sales-status-filter"
          allowClear
          placeholder="全部状态"
          style={{ width: 210 }}
          value={status}
          options={Object.entries(afterSalesStatusLabels).map(([value, label]) => ({ value, label }))}
          onChange={(value: AfterSalesStatus | undefined) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <Select
          data-testid="after-sales-type-filter"
          allowClear
          placeholder="全部类型"
          style={{ width: 180 }}
          value={type}
          options={Object.entries(afterSalesTypeLabels).map(([value, label]) => ({ value, label }))}
          onChange={(value: AfterSalesType | undefined) => {
            setType(value);
            setPage(1);
          }}
        />
      </Space>

      <Table
        data-testid="admin-after-sales-table"
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1250 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          showTotal: (count) => `共 ${count} 个售后单`,
        }}
        onChange={handlePagination}
      />

      <Drawer
        title={detail ? `售后单 ${detail.caseNo}` : '售后详情'}
        open={drawerOpen}
        width={760}
        loading={detailLoading}
        onClose={() => setDrawerOpen(false)}
      >
        {detail && (
          <div className="space-y-5" data-testid="after-sales-detail-drawer">
            {conflictNotice && (
              <Alert
                data-testid="after-sales-conflict"
                type="warning"
                showIcon
                message="操作未提交"
                description={conflictNotice}
              />
            )}

            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="售后单号" span={2}>{detail.caseNo}</Descriptions.Item>
              <Descriptions.Item label="订单">{detail.orderId ? `#${detail.orderId}` : '-'}</Descriptions.Item>
              <Descriptions.Item label="顾客">#{detail.customerId}</Descriptions.Item>
              <Descriptions.Item label="类型">{afterSalesTypeLabels[detail.type]}</Descriptions.Item>
              <Descriptions.Item label="版本">v{detail.version}</Descriptions.Item>
              <Descriptions.Item label="状态" span={2}>
                <Tag color={afterSalesStatusColors[detail.status]}>
                  {afterSalesStatusLabels[detail.status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="退款状态" span={2}>
                {detail.refundStatus ? refundStatusLabels[detail.refundStatus] : '尚未发起'}
              </Descriptions.Item>
              <Descriptions.Item label="申请金额">{formatMoney(detail.requestedAmount)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{formatDate(detail.updatedAt)}</Descriptions.Item>
              <Descriptions.Item label="原因" span={2}>{maskSensitiveText(detail.reason)}</Descriptions.Item>
              <Descriptions.Item label="说明" span={2}>
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                  {maskSensitiveText(detail.description)}
                </Typography.Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="处理结论" span={2}>
                {maskSensitiveText(detail.resolutionNote)}
              </Descriptions.Item>
            </Descriptions>

            {(transitions.length > 0 || canInitiateRefund(detail) || canSyncRefund(detail)) && (
              <div className="rounded-md border border-neutral-700 p-4 space-y-3">
                <Alert
                  type="info"
                  showIcon
                  message="状态更新使用乐观并发控制"
                  description={`本次提交基于版本 v${detail.version}；若已被其他管理员更新，系统会拒绝覆盖并自动刷新。`}
                />
                {transitions.length > 0 && (
                  <Select
                    data-testid="after-sales-target-status"
                    value={targetStatus}
                    style={{ width: '100%' }}
                    options={transitions.map((value) => ({
                      value,
                      label: afterSalesStatusLabels[value],
                    }))}
                    onChange={setTargetStatus}
                  />
                )}
                <Input.TextArea
                  data-testid="after-sales-action-note"
                  value={note}
                  maxLength={1000}
                  rows={3}
                  showCount
                  placeholder="填写审核依据、拒绝原因或后续处理说明（至少 2 个字符）"
                  onChange={(event) => setNote(event.target.value)}
                />
                <Space wrap>
                  {transitions.length > 0 && (
                    <Button
                      type="primary"
                      data-testid="after-sales-submit-status"
                      loading={actionLoading}
                      onClick={() => void submitStatus()}
                    >
                      提交状态变更
                    </Button>
                  )}
                  {canInitiateRefund(detail) && (
                    <Button
                      danger
                      data-testid="after-sales-initiate-refund"
                      loading={actionLoading}
                      onClick={() => void submitRefund()}
                    >
                      提交统一退款流程
                    </Button>
                  )}
                  {canSyncRefund(detail) && (
                    <Button
                      data-testid="after-sales-sync-refund"
                      loading={actionLoading}
                      onClick={() => void syncRefund()}
                    >
                      同步退款状态
                    </Button>
                  )}
                </Space>
              </div>
            )}

            <div>
              <h2 className="text-base font-medium mb-3">处理历史</h2>
              <Table
                dataSource={detail.history}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: '版本', dataIndex: 'version', width: 70, render: (value) => `v${value}` },
                  {
                    title: '状态变更',
                    key: 'transition',
                    width: 230,
                    render: (_, history) => (
                      <Space size="small">
                        <span>{history.fromStatus ? afterSalesStatusLabels[history.fromStatus] : '创建'}</span>
                        <span>→</span>
                        <Tag color={afterSalesStatusColors[history.toStatus]}>
                          {afterSalesStatusLabels[history.toStatus]}
                        </Tag>
                      </Space>
                    ),
                  },
                  {
                    title: '操作者',
                    key: 'actor',
                    width: 120,
                    render: (_, history) => history.actorType === 'customer'
                      ? `顾客 #${history.actorId ?? '-'}`
                      : `${history.actorType === 'admin' ? '管理员' : '系统'} #${history.actorId ?? '-'}`,
                  },
                  { title: '说明', dataIndex: 'note', render: maskSensitiveText },
                  { title: '时间', dataIndex: 'createdAt', width: 170, render: formatDate },
                ]}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
