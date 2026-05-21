# 前端架构升级指南 - Next.js + TypeScript

## 概述

将现有React应用升级到Next.js 14 + TypeScript，提供更好的性能、SEO和开发体验。

---

## 技术栈

### 核心框架
- **Next.js 14** - React框架，支持SSR/SSG
- **TypeScript** - 类型安全
- **React 18** - UI库

### UI组件库
- **Ant Design 5** - 企业级UI组件
- **Tailwind CSS** - 实用优先的CSS框架
- **Framer Motion** - 动画库

### 状态管理
- **Redux Toolkit** - 全局状态管理
- **React Query** - 服务端状态管理
- **Zustand** - 轻量级状态管理

### 数据可视化
- **ECharts** - 图表库
- **Recharts** - React图表组件

### 工具库
- **Axios** - HTTP客户端
- **Day.js** - 日期处理
- **React Hook Form** - 表单管理
- **Zod** - 数据验证

---

## 项目结构

```
frontend-next/
├── app/                      # Next.js 14 App Router
│   ├── (auth)/              # 认证相关页面
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/         # 仪表板布局
│   │   ├── products/        # 产品管理
│   │   ├── orders/          # 订单管理
│   │   ├── inventory/       # 库存管理
│   │   ├── supply-chain/    # 供应链管理
│   │   ├── analytics/       # 数据分析
│   │   └── settings/        # 设置
│   ├── api/                 # API路由
│   ├── layout.tsx           # 根布局
│   └── page.tsx             # 首页
├── components/              # 组件
│   ├── ui/                  # UI组件
│   ├── forms/               # 表单组件
│   ├── charts/              # 图表组件
│   └── layouts/             # 布局组件
├── lib/                     # 工具库
│   ├── api/                 # API客户端
│   ├── hooks/               # 自定义Hooks
│   ├── utils/               # 工具函数
│   └── types/               # TypeScript类型
├── store/                   # Redux Store
│   ├── slices/              # Redux Slices
│   └── index.ts
├── styles/                  # 样式文件
├── public/                  # 静态资源
├── next.config.js           # Next.js配置
├── tailwind.config.js       # Tailwind配置
├── tsconfig.json            # TypeScript配置
└── package.json
```

---

## 快速开始

### 1. 创建Next.js项目

```bash
npx create-next-app@latest frontend-next --typescript --tailwind --app
cd frontend-next
```

### 2. 安装依赖

```bash
# UI组件库
npm install antd @ant-design/icons
npm install framer-motion

# 状态管理
npm install @reduxjs/toolkit react-redux
npm install @tanstack/react-query
npm install zustand

# 数据可视化
npm install echarts echarts-for-react
npm install recharts

# 工具库
npm install axios
npm install dayjs
npm install react-hook-form @hookform/resolvers zod
npm install i18next react-i18next next-i18next

# 开发依赖
npm install -D @types/node @types/react @types/react-dom
npm install -D eslint-config-next
```

### 3. 配置文件

#### next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // 环境变量
  env: {
    API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
  
  // 图片优化
  images: {
    domains: ['localhost'],
    formats: ['image/avif', 'image/webp'],
  },
  
  // 国际化
  i18n: {
    locales: ['zh', 'en'],
    defaultLocale: 'zh',
  },
  
  // 输出配置
  output: 'standalone',
};

module.exports = nextConfig;
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["./components/*"],
      "@/lib/*": ["./lib/*"],
      "@/store/*": ["./store/*"],
      "@/types/*": ["./lib/types/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 核心功能实现

### 1. API客户端

```typescript
// lib/api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // 跳转到登录页
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### 2. TypeScript类型定义

```typescript
// lib/types/product.ts
export interface Product {
  id: number;
  name: string;
  model: string;
  price: number;
  image: string;
  category: string;
  specs: {
    innerDiameter: number;
    outerDiameter: number;
    width: number;
  };
  stock: number;
  description: string;
  createdAt: string;
}

export interface ProductFormData {
  name: string;
  model: string;
  price: number;
  category: string;
  innerDiameter: number;
  outerDiameter: number;
  width: number;
  stock: number;
  description?: string;
}

// lib/types/order.ts
export interface Order {
  id: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  totalPrice: number;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  trackingNumber?: string;
  createdAt: string;
  shippedAt?: string;
  completedAt?: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  bearingId: number;
  name: string;
  model: string;
  quantity: number;
  price: number;
}
```

### 3. Redux Store

```typescript
// store/slices/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
  } | null;
  token: string | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: any; token: string }>) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;

// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### 4. React Query Hooks

```typescript
// lib/hooks/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Product, ProductFormData } from '@/types/product';

export const useProducts = (category?: string) => {
  return useQuery({
    queryKey: ['products', category],
    queryFn: async () => {
      const params = category ? { category } : {};
      return apiClient.get<Product[]>('/api/bearings', { params });
    },
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: ProductFormData) => 
      apiClient.post('/api/bearings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
};
```

### 5. 页面组件示例

```typescript
// app/(dashboard)/products/page.tsx
'use client';

import { useState } from 'react';
import { Table, Button, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useProducts } from '@/lib/hooks/useProducts';
import type { Product } from '@/types/product';

export default function ProductsPage() {
  const [category, setCategory] = useState<string>();
  const { data: products, isLoading } = useProducts(category);

  const columns = [
    {
      title: '产品名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '型号',
      dataIndex: 'model',
      key: 'model',
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      render: (price: number) => `¥${price.toFixed(2)}`,
    },
    {
      title: '库存',
      dataIndex: 'stock',
      key: 'stock',
      render: (stock: number) => (
        <Tag color={stock > 10 ? 'green' : stock > 0 ? 'orange' : 'red'}>
          {stock}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Product) => (
        <Space>
          <Button icon={<EditOutlined />} size="small">
            编辑
          </Button>
          <Button icon={<DeleteOutlined />} size="small" danger>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">产品管理</h1>
        <Button type="primary" icon={<PlusOutlined />}>
          添加产品
        </Button>
      </div>
      
      <Table
        columns={columns}
        dataSource={products}
        loading={isLoading}
        rowKey="id"
      />
    </div>
  );
}
```

---

## 性能优化

### 1. 图片优化

```typescript
import Image from 'next/image';

<Image
  src="/images/product.jpg"
  alt="Product"
  width={300}
  height={300}
  priority
  placeholder="blur"
/>
```

### 2. 代码分割

```typescript
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('@/components/charts/SalesChart'), {
  loading: () => <p>Loading...</p>,
  ssr: false,
});
```

### 3. 缓存策略

```typescript
// app/api/products/route.ts
export const revalidate = 60; // 60秒缓存

export async function GET() {
  const products = await fetchProducts();
  return Response.json(products);
}
```

---

## 部署

### Vercel部署

```bash
# 安装Vercel CLI
npm i -g vercel

# 部署
vercel
```

### Docker部署

```dockerfile
FROM node:18-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

---

## 迁移步骤

### 1. 创建新项目
```bash
npx create-next-app@latest frontend-next --typescript --tailwind --app
```

### 2. 迁移组件
- 将现有React组件复制到`components/`
- 添加TypeScript类型
- 更新导入路径

### 3. 迁移页面
- 将页面组件移到`app/`目录
- 使用App Router结构
- 添加布局组件

### 4. 迁移状态管理
- 设置Redux Toolkit
- 迁移状态逻辑
- 添加React Query

### 5. 测试和优化
- 测试所有功能
- 优化性能
- 添加SEO

---

## 总结

Next.js + TypeScript架构提供：

- ✅ 更好的性能（SSR/SSG）
- ✅ 类型安全（TypeScript）
- ✅ 更好的SEO
- ✅ 更好的开发体验
- ✅ 自动代码分割
- ✅ 图片优化
- ✅ API路由

完整的企业级前端解决方案。
