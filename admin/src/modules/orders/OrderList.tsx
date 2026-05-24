import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Space, Tag, Drawer, message, Popconfirm, Descriptions,
} from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import adminApi from '@/shared/lib/adminApi';

interface OrderItem {
  id: number; order_id: number; bearing_id: number; quantity: number; price: number;
  name?: { zh: string }; model?: string;
}
interface Order {
  id: number; customer_name: string; customer_phone: string; province: string; city: string;
  district: string; address_detail: string; total_price: number; status: string;
  tracking_number?: string; created_at: string; shipped_at?: string; completed_at?: string;
}
interface StatusRecord {
  id: number; order_id: number; old_status: string; new_status: string; note: string; created_at: string;
}

const statusColors: Record<string, string> = {
  pending: 'default', paid: 'processing', shipped: 'blue', completed: 'green', cancelled: 'error',
};
const statusLabels: Record<string, string> = {
  pending: '待处理', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消',
};
const statusTabs = ['', 'pending', 'paid', 'shipped', 'completed', 'cancelled'];

const canShip = (s: string) => s === 'paid';
const canCancel = (s: string) => ['pending', 'paid'].includes(s);

function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleString('zh-CN') : '-';
}

export default function OrderList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<StatusRecord[]>([]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get('/orders');
      let data: Order[] = Array.isArray(res.data) ? res.data : res.data?.data || [];
      if (status) data = data.filter(o => o.status === status);
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        data = data.filter(o =>
          String(o.id) === q || o.customer_name?.includes(q) || o.customer_phone?.includes(q)
        );
      }
      setOrders(data);
    } catch { message.error('加载订单失败'); }
    finally { setLoading(false); }
  }, [status, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleStatus = async (orderId: number, newStatus: string) => {
    try {
      await adminApi.put(`/orders/${orderId}/status`, { status: newStatus });
      message.success('状态已更新');
      fetchOrders();
    } catch { message.error('操作失败'); }
  };

  const handleBatch = async (newStatus: string) => {
    if (selected.length === 0) return message.warning('请先选择订单');
    try {
      await adminApi.put('/orders/batch/status', { orderIds: selected, status: newStatus });
      message.success(`已批量${newStatus === 'shipped' ? '发货' : '取消'} ${selected.length} 个订单`);
      setSelected([]);
      fetchOrders();
    } catch { message.error('批量操作失败'); }
  };

  const handleExportExcel = async () => {
    const res = await adminApi.get('/orders/export/excel', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a'); a.href = url; a.download = `orders-${Date.now()}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async (orderId: number) => {
    const res = await adminApi.get(`/orders/${orderId}/export/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a'); a.href = url; a.download = `order-${orderId}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = async (order: Order) => {
    setDetail(order);
    setDrawerOpen(true);
    try {
      const [itemsRes, historyRes] = await Promise.all([
        adminApi.get(`/orders/${order.id}/items`),
        adminApi.get(`/orders/${order.id}/history`),
      ]);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : itemsRes.data?.data || []);
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : historyRes.data?.data || []);
    } catch { message.error('加载订单详情失败'); }
  };

  const columns: ColumnsType<Order> = [
    { title: '订单号', dataIndex: 'id', width: 70, render: (v: number) => <span className="font-mono">#{v}</span> },
    { title: '客户', dataIndex: 'customer_name', width: 100, ellipsis: true },
    { title: '电话', dataIndex: 'customer_phone', width: 120 },
    {
      title: '金额', dataIndex: 'total_price', width: 90,
      render: (v: number) => <span className="font-mono">¥{v?.toFixed(2)}</span>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>,
    },
    { title: '时间', dataIndex: 'created_at', width: 150, render: (v: string) => fmtDate(v) },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openDetail(record)}>详情</Button>
          {canShip(record.status) && (
            <Popconfirm title="确认发货？" onConfirm={() => handleStatus(record.id, 'shipped')}>
              <Button type="link" size="small">发货</Button>
            </Popconfirm>
          )}
          {canCancel(record.status) && (
            <Popconfirm title="确认取消？" onConfirm={() => handleStatus(record.id, 'cancelled')}>
              <Button type="link" size="small" danger>取消</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-neutral-200">订单管理</h1>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExportExcel}>导出 Excel</Button>
        </Space>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 flex gap-2">
          {statusTabs.map(s => (
            <Button
              key={s}
              type={status === s ? 'primary' : 'default'}
              size="small"
              onClick={() => setStatus(s)}
            >
              {s ? statusLabels[s] : '全部'}
            </Button>
          ))}
        </div>
        <Input
          placeholder="搜索订单号/客户/电话"
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ width: 240 }}
        />
      </div>

      {selected.length > 0 && (
        <div className="mb-3 p-3 bg-neutral-800 rounded-md flex items-center gap-3">
          <span className="text-sm text-neutral-400">已选 {selected.length} 个订单</span>
          <Button size="small" type="primary" onClick={() => handleBatch('shipped')}>批量发货</Button>
          <Button size="small" danger onClick={() => handleBatch('cancelled')}>批量取消</Button>
          <Button size="small" onClick={() => setSelected([])}>取消选择</Button>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={orders}
        rowKey="id"
        loading={loading}
        size="middle"
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as number[]),
        }}
        pagination={{
          pageSize: 20,
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 个订单`,
        }}
      />

      <Drawer
        title={detail ? `订单 #${detail.id}` : '订单详情'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        extra={detail && (
          <Button onClick={() => handleExportPdf(detail.id)}>导出 PDF</Button>
        )}
      >
        {detail && (
          <div className="space-y-5">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="客户">{detail.customer_name}</Descriptions.Item>
              <Descriptions.Item label="电话">{detail.customer_phone}</Descriptions.Item>
              <Descriptions.Item label="地址">
                {detail.province} {detail.city} {detail.district} {detail.address_detail}
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                <span className="font-mono font-semibold">¥{detail.total_price?.toFixed(2)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColors[detail.status]}>{statusLabels[detail.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="物流单号">{detail.tracking_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{fmtDate(detail.created_at)}</Descriptions.Item>
              {detail.shipped_at && <Descriptions.Item label="发货时间">{fmtDate(detail.shipped_at)}</Descriptions.Item>}
              {detail.completed_at && <Descriptions.Item label="完成时间">{fmtDate(detail.completed_at)}</Descriptions.Item>}
            </Descriptions>

            <div>
              <h4 className="text-sm font-medium mb-2">商品明细</h4>
              <Table
                dataSource={items}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: '产品', dataIndex: 'name', render: (v: { zh: string } | string) => typeof v === 'object' ? v?.zh : v },
                  { title: '型号', dataIndex: 'model', width: 80 },
                  { title: '数量', dataIndex: 'quantity', width: 50 },
                  { title: '单价', dataIndex: 'price', width: 80, render: (v: number) => `¥${v}` },
                ]}
              />
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">状态变更历史</h4>
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex justify-between text-xs p-2 bg-neutral-800 rounded">
                    <div>
                      <Tag color={statusColors[h.old_status]}>{statusLabels[h.old_status] || h.old_status || '-'}</Tag>
                      <span className="text-neutral-400">→</span>
                      <Tag color={statusColors[h.new_status]}>{statusLabels[h.new_status]}</Tag>
                    </div>
                    <span className="text-neutral-500">{h.note || ''}</span>
                    <span className="text-neutral-500">{fmtDate(h.created_at)}</span>
                  </div>
                ))}
                {history.length === 0 && <p className="text-neutral-500 text-xs">无记录</p>}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
