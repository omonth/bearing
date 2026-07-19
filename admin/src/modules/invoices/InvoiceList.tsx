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
  getInvoiceRequest,
  listInvoiceRequests,
  parseInvoiceApiError,
  updateInvoiceRequestStatus,
} from './invoiceApi';
import {
  availableInvoiceTransitions,
  invoiceStatusColors,
  invoiceStatusLabels,
  invoiceStatusSuccessMessage,
  invoiceTitleTypeLabels,
  validateInvoiceAction,
} from './invoiceModel';
import type { InvoiceDetail, InvoiceRequest, InvoiceStatus } from './types';

const PAGE_SIZE = 20;

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

function displayValue(value?: string | null) {
  return value || '-';
}

export default function InvoiceList() {
  const [items, setItems] = useState<InvoiceRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InvoiceStatus | undefined>();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [targetStatus, setTargetStatus] = useState<InvoiceStatus | undefined>();
  const [note, setNote] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listInvoiceRequests({ status, page, pageSize: PAGE_SIZE });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      message.error(parseInvoiceApiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  const loadDetail = useCallback(async (invoiceId: number) => {
    setDetailLoading(true);
    try {
      const result = await getInvoiceRequest(invoiceId);
      setDetail(result);
      setTargetStatus(availableInvoiceTransitions(result.status)[0]);
      setInvoiceNumber(result.invoiceNumber || '');
      return result;
    } catch (error) {
      message.error(parseInvoiceApiError(error).message);
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchInvoices(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchInvoices]);

  const transitions = useMemo(
    () => detail ? availableInvoiceTransitions(detail.status) : [],
    [detail],
  );

  const openDetail = async (item: InvoiceRequest) => {
    setDrawerOpen(true);
    setConflictNotice(null);
    setNote('');
    setInvoiceNumber('');
    await loadDetail(item.id);
  };

  const refreshAfterAction = async (invoiceId: number) => {
    await Promise.all([fetchInvoices(), loadDetail(invoiceId)]);
  };

  const handleActionError = async (error: unknown, invoiceId: number) => {
    const failure = parseInvoiceApiError(error);
    if (failure.status === 409) {
      setConflictNotice(failure.versionConflict
        ? '该发票申请已被其他管理员更新，已加载最新版本，请核对后重试。'
        : failure.message);
      await refreshAfterAction(invoiceId);
      return;
    }
    message.error(failure.message);
  };

  const submitStatus = async () => {
    if (!detail || !targetStatus) return;
    const validationMessage = validateInvoiceAction(targetStatus, note, invoiceNumber);
    if (validationMessage) {
      message.warning(validationMessage);
      return;
    }
    setActionLoading(true);
    setConflictNotice(null);
    try {
      const input = {
        status: targetStatus,
        expectedVersion: detail.version,
        note: note.trim(),
        ...(targetStatus === 'issued' ? { invoiceNumber: invoiceNumber.trim() } : {}),
      };
      const updated = await updateInvoiceRequestStatus(detail.id, input);
      message.success(invoiceStatusSuccessMessage(updated.status));
      setNote('');
      await refreshAfterAction(detail.id);
    } catch (error) {
      await handleActionError(error, detail.id);
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnsType<InvoiceRequest> = [
    {
      title: '申请编号',
      dataIndex: 'id',
      width: 110,
      render: (value: number) => <Typography.Text code>INV-REQ-{value}</Typography.Text>,
    },
    {
      title: '订单',
      dataIndex: 'orderId',
      width: 90,
      render: (value: number) => `#${value}`,
    },
    {
      title: '顾客',
      dataIndex: 'customerId',
      width: 90,
      render: (value: number) => `#${value}`,
    },
    {
      title: '发票抬头',
      key: 'title',
      ellipsis: true,
      render: (_, item) => item.profileSnapshot.title,
    },
    {
      title: '类型',
      key: 'titleType',
      width: 90,
      render: (_, item) => invoiceTitleTypeLabels[item.profileSnapshot.titleType],
    },
    {
      title: '接收邮箱',
      key: 'email',
      ellipsis: true,
      render: (_, item) => item.profileSnapshot.email,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 170,
      render: (value: InvoiceStatus) => (
        <Tag color={invoiceStatusColors[value]}>{invoiceStatusLabels[value]}</Tag>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 70,
      render: (value: number) => `v${value}`,
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
      width: 100,
      fixed: 'right',
      render: (_, item) => (
        <Button
          type="link"
          size="small"
          data-testid={`invoice-detail-${item.id}`}
          onClick={() => void openDetail(item)}
        >
          详情/处理
        </Button>
      ),
    },
  ];

  const handlePagination = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1);
  };

  return (
    <div data-testid="admin-invoices-page">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-200">发票管理</h1>
          <p className="text-sm text-neutral-500 mt-1">
            本页面仅记录开票处理结果；只有外部发票系统已实际开具并返回真实发票号码后，才能标记为已开票。
          </p>
        </div>
        <Button onClick={() => void fetchInvoices()} loading={loading}>刷新</Button>
      </div>

      <Space wrap className="mb-4">
        <Select
          data-testid="invoice-status-filter"
          allowClear
          placeholder="全部状态"
          style={{ width: 220 }}
          value={status}
          options={Object.entries(invoiceStatusLabels).map(([value, label]) => ({ value, label }))}
          onChange={(value: InvoiceStatus | undefined) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Space>

      <Table
        data-testid="admin-invoices-table"
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          showTotal: (count) => `共 ${count} 个发票申请`,
        }}
        onChange={handlePagination}
      />

      <Drawer
        title={detail ? `发票申请 INV-REQ-${detail.id}` : '发票申请详情'}
        open={drawerOpen}
        width={780}
        loading={detailLoading}
        onClose={() => setDrawerOpen(false)}
      >
        {detail && (
          <div className="space-y-5" data-testid="invoice-detail-drawer">
            {conflictNotice && (
              <Alert
                data-testid="invoice-conflict"
                type="warning"
                showIcon
                message="操作未提交"
                description={conflictNotice}
              />
            )}

            <Alert
              type="warning"
              showIcon
              message="禁止伪造开票成功"
              description="提交“已开票”不会调用外部开票平台；请先在真实发票系统完成开具，再填写其返回的真实发票号码。"
            />

            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="申请编号">INV-REQ-{detail.id}</Descriptions.Item>
              <Descriptions.Item label="版本">v{detail.version}</Descriptions.Item>
              <Descriptions.Item label="订单">#{detail.orderId}</Descriptions.Item>
              <Descriptions.Item label="顾客">#{detail.customerId}</Descriptions.Item>
              <Descriptions.Item label="状态" span={2}>
                <Tag color={invoiceStatusColors[detail.status]}>
                  {invoiceStatusLabels[detail.status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="抬头类型">
                {invoiceTitleTypeLabels[detail.profileSnapshot.titleType]}
              </Descriptions.Item>
              <Descriptions.Item label="发票抬头">{detail.profileSnapshot.title}</Descriptions.Item>
              <Descriptions.Item label="税号" span={2}>
                {displayValue(detail.profileSnapshot.taxNumber)}
              </Descriptions.Item>
              <Descriptions.Item label="接收邮箱">{detail.profileSnapshot.email}</Descriptions.Item>
              <Descriptions.Item label="联系电话">
                {displayValue(detail.profileSnapshot.recipientPhone)}
              </Descriptions.Item>
              <Descriptions.Item label="注册地址" span={2}>
                {displayValue(detail.profileSnapshot.registeredAddress)}
              </Descriptions.Item>
              <Descriptions.Item label="开户行">{displayValue(detail.profileSnapshot.bankName)}</Descriptions.Item>
              <Descriptions.Item label="银行账号">
                {displayValue(detail.profileSnapshot.bankAccount)}
              </Descriptions.Item>
              <Descriptions.Item label="发票号码" span={2}>
                {displayValue(detail.invoiceNumber)}
              </Descriptions.Item>
              <Descriptions.Item label="处理说明" span={2}>
                {displayValue(detail.resolutionNote)}
              </Descriptions.Item>
              <Descriptions.Item label="申请时间">{formatDate(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="开票时间">{formatDate(detail.issuedAt)}</Descriptions.Item>
            </Descriptions>

            {transitions.length > 0 && (
              <div className="rounded-md border border-neutral-700 p-4 space-y-3">
                <Alert
                  type="info"
                  showIcon
                  message="状态更新使用乐观并发控制"
                  description={`本次提交基于版本 v${detail.version}；其他管理员已更新时，系统会拒绝覆盖并重新加载详情。`}
                />
                <Select
                  data-testid="invoice-target-status"
                  value={targetStatus}
                  style={{ width: '100%' }}
                  options={transitions.map((value) => ({
                    value,
                    label: invoiceStatusLabels[value],
                  }))}
                  onChange={(value: InvoiceStatus) => {
                    setTargetStatus(value);
                    if (value !== 'issued') setInvoiceNumber('');
                  }}
                />
                {targetStatus === 'issued' && (
                  <>
                    <Alert
                      type="warning"
                      showIcon
                      message="仅记录外部系统已实际开具的发票"
                    />
                    <Input
                      data-testid="invoice-number"
                      value={invoiceNumber}
                      maxLength={100}
                      placeholder="真实发票号码，例如 INV-20260719-001"
                      onChange={(event) => setInvoiceNumber(event.target.value)}
                    />
                  </>
                )}
                <Input.TextArea
                  data-testid="invoice-action-note"
                  value={note}
                  maxLength={1000}
                  rows={3}
                  showCount
                  placeholder="填写处理依据、拒绝原因或实际开票说明（至少 2 个字符）"
                  onChange={(event) => setNote(event.target.value)}
                />
                <Button
                  type="primary"
                  data-testid="invoice-submit-status"
                  loading={actionLoading}
                  onClick={() => void submitStatus()}
                >
                  提交状态变更
                </Button>
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
                    width: 250,
                    render: (_, history) => (
                      <Space size="small">
                        <span>{history.fromStatus ? invoiceStatusLabels[history.fromStatus] : '创建'}</span>
                        <span>→</span>
                        <Tag color={invoiceStatusColors[history.toStatus]}>
                          {invoiceStatusLabels[history.toStatus]}
                        </Tag>
                      </Space>
                    ),
                  },
                  {
                    title: '操作者',
                    key: 'actor',
                    width: 120,
                    render: (_, history) => history.actorType === 'customer'
                      ? `顾客 #${history.actorId}`
                      : `管理员 #${history.actorId}`,
                  },
                  { title: '说明', dataIndex: 'note', render: displayValue },
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
