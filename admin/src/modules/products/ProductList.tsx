import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Modal, Form,
  InputNumber, message, Image, Popconfirm, Tag,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import adminApi from '@/shared/lib/adminApi';
import ImageUpload from '@/shared/components/ImageUpload';
import type { Bearing } from '@/shared/types';

export default function ProductList() {
  const [products, setProducts] = useState<Bearing[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get('/search', {
        params: { q: search || undefined, category: category || undefined, sortBy: 'id', order: 'desc' },
      });
      const body = res.data.data || res.data;
      setProducts(body?.results || []);
      setTotal(body?.total || 0);
    } catch { message.error('加载产品失败'); }
    finally { setLoading(false); }
  }, [search, category]);

  useEffect(() => {
    const timer = window.setTimeout(fetchProducts, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProducts]);

  useEffect(() => {
    adminApi.get('/categories').then(r => setCategories(Array.isArray(r.data) ? r.data : r.data.data || [])).catch(() => {});
  }, []);

  const handleUpdate = async (id: number, field: string, value: unknown) => {
    try {
      await adminApi.put(`/bearings/${id}`, { [field]: value });
      setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
      message.success('已更新');
    } catch { message.error('更新失败'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminApi.delete(`/bearings/${id}`);
      setProducts(prev => prev.filter(p => p.id !== id));
      message.success('已删除');
    } catch { message.error('删除失败'); }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        name: JSON.stringify({ zh: values.name, en: values.name_en || '' }),
        description: JSON.stringify({ zh: values.description || '', en: values.description_en || '' }),
      };
      delete payload.name_en;
      delete payload.description_en;
      await adminApi.post('/bearings', payload);
      message.success('产品已添加');
      setCreateOpen(false);
      form.resetFields();
      fetchProducts();
    } catch { /* validation error */ }
  };

  const ln = (val: Bearing['name']) => val?.zh || '';

  const columns: ColumnsType<Bearing> = [
    {
      title: '图片', dataIndex: 'image', width: 80,
      render: (img: string) => (
        <Image alt="" src={img || '/placeholder.svg'} width={48} height={48} className="object-cover rounded" />
      ),
    },
    { title: '名称', dataIndex: 'name', width: 200, render: (_: unknown, r: Bearing) => ln(r.name), ellipsis: true },
    { title: '型号', dataIndex: 'model', width: 100, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { title: '分类', dataIndex: 'category', width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '价格', dataIndex: 'price', width: 100,
      render: (val: number, record) => (
        <InputNumber
          size="small"
          defaultValue={val}
          min={0.01} step={0.01}
          style={{ width: 90 }}
          prefix="¥"
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (v && v !== val) handleUpdate(record.id, 'price', v);
          }}
          onPressEnter={(e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            if (v && v !== val) handleUpdate(record.id, 'price', v);
          }}
        />
      ),
    },
    {
      title: '库存', dataIndex: 'stock', width: 90,
      render: (val: number, record) => (
        <InputNumber
          size="small"
          defaultValue={val}
          min={0}
          style={{ width: 74 }}
          onBlur={(e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v) && v !== val) handleUpdate(record.id, 'stock', v);
          }}
          onPressEnter={(e) => {
            const v = parseInt((e.target as HTMLInputElement).value);
            if (!isNaN(v) && v !== val) handleUpdate(record.id, 'stock', v);
          }}
        />
      ),
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, record) => (
        <Space size="small">
          <Popconfirm title="确定删除此产品？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-neutral-200">商品管理</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新增商品
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          data-testid="admin-products-search"
          placeholder="搜索型号或名称"
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          allowClear
          style={{ width: 260 }}
        />
        <Select
          placeholder="全部分类"
          allowClear
          value={category || undefined}
          onChange={v => { setCategory(v || ''); setPage(1); }}
          style={{ width: 160 }}
          options={categories.map(c => ({ value: c, label: c }))}
        />
      </div>

      <Table
        data-testid="admin-products-table"
        columns={columns}
        dataSource={products}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{
          current: page,
          onChange: setPage,
          pageSize: 20,
          total,
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 个产品`,
        }}
      />

      <Modal
        title="新增商品"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={handleCreate}
        width={560}
      >
        <Form form={form} layout="vertical">
          <div className="flex gap-3">
            <Form.Item name="name" label="产品名称 (中文)" rules={[{ required: true }]} className="flex-1">
              <Input />
            </Form.Item>
            <Form.Item name="name_en" label="产品名称 (英文)" className="flex-1">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="model" label="型号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div className="flex gap-3">
            <Form.Item name="price" label="价格" rules={[{ required: true }]} className="flex-1">
              <InputNumber min={0.01} step={0.01} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="stock" label="库存" rules={[{ required: true }]} className="flex-1">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="category" label="分类" rules={[{ required: true }]} className="flex-1">
              <Select options={categories.map(c => ({ value: c, label: c }))} />
            </Form.Item>
          </div>
          <div className="flex gap-3">
            <Form.Item name="description" label="产品描述 (中文)" className="flex-1">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="description_en" label="产品描述 (英文)" className="flex-1">
              <Input.TextArea rows={2} />
            </Form.Item>
          </div>
          <Form.Item name="image" label="图片">
            <ImageUpload />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
