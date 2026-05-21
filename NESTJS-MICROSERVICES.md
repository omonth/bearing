# NestJS 微服务架构升级指南

## 概述

将现有Express应用升级到NestJS微服务架构，提供更好的可维护性、可扩展性和企业级特性。

---

## 微服务架构设计

### 服务拆分

```
┌─────────────────────────────────────────────────────────┐
│                    API Gateway                          │
│  (NestJS + GraphQL + REST)                             │
│  - 路由转发                                             │
│  - 认证授权                                             │
│  - 限流熔断                                             │
└─────────────────────────────────────────────────────────┘
                          ↓
    ┌──────────┬──────────┬──────────┬──────────┬──────────┐
    │          │          │          │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│产品服务│ │订单服务│ │用户服务│ │供应链 │ │CRM服务│
│Product│ │ Order │ │ User  │ │Supply │ │  CRM  │
│Service│ │Service│ │Service│ │ Chain │ │Service│
└───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘
    │         │         │         │         │
    └─────────┴─────────┴─────────┴─────────┘
                        ↓
              ┌─────────────────┐
              │  Message Queue  │
              │  (RabbitMQ)     │
              └─────────────────┘
                        ↓
    ┌──────────┬──────────┬──────────┬──────────┐
    │          │          │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│PostgreSQL│ │ Redis │ │Elasticsearch│ │MongoDB│
└─────────┘ └───────┘ └─────────┘ └───────┘
```

---

## 技术栈

### 核心框架
- **NestJS** - 企业级Node.js框架
- **TypeScript** - 类型安全
- **GraphQL** - API查询语言
- **Prisma** - 现代ORM

### 微服务通信
- **RabbitMQ** - 消息队列
- **gRPC** - 高性能RPC
- **Redis** - 缓存和发布订阅

### 服务发现
- **Consul** - 服务注册与发现
- **Kubernetes** - 容器编排

### 监控和日志
- **Prometheus** - 监控
- **Grafana** - 可视化
- **ELK Stack** - 日志聚合

---

## 项目结构

```
microservices/
├── api-gateway/              # API网关
│   ├── src/
│   │   ├── auth/            # 认证模块
│   │   ├── graphql/         # GraphQL
│   │   ├── rest/            # REST API
│   │   └── main.ts
│   ├── Dockerfile
│   └── package.json
│
├── product-service/          # 产品服务
│   ├── src/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── inventory/
│   │   └── main.ts
│   ├── prisma/
│   ├── Dockerfile
│   └── package.json
│
├── order-service/            # 订单服务
│   ├── src/
│   │   ├── orders/
│   │   ├── order-items/
│   │   ├── payments/
│   │   └── main.ts
│   ├── Dockerfile
│   └── package.json
│
├── user-service/             # 用户服务
│   ├── src/
│   │   ├── users/
│   │   ├── auth/
│   │   ├── roles/
│   │   └── main.ts
│   ├── Dockerfile
│   └── package.json
│
├── supply-chain-service/     # 供应链服务
│   ├── src/
│   │   ├── suppliers/
│   │   ├── purchase-orders/
│   │   ├── stock/
│   │   └── main.ts
│   ├── Dockerfile
│   └── package.json
│
├── crm-service/              # CRM服务
│   ├── src/
│   │   ├── customers/
│   │   ├── points/
│   │   ├── coupons/
│   │   └── main.ts
│   ├── Dockerfile
│   └── package.json
│
├── notification-service/     # 通知服务
│   ├── src/
│   │   ├── email/
│   │   ├── sms/
│   │   ├── websocket/
│   │   └── main.ts
│   ├── Dockerfile
│   └── package.json
│
├── shared/                   # 共享库
│   ├── dto/
│   ├── interfaces/
│   ├── decorators/
│   └── utils/
│
├── docker-compose.yml
└── kubernetes/
    ├── api-gateway.yaml
    ├── product-service.yaml
    └── ...
```

---

## 快速开始

### 1. 安装NestJS CLI

```bash
npm i -g @nestjs/cli
```

### 2. 创建API网关

```bash
nest new api-gateway
cd api-gateway

# 安装依赖
npm install @nestjs/microservices
npm install @nestjs/graphql @nestjs/apollo
npm install @apollo/server graphql
npm install amqplib amqp-connection-manager
```

### 3. 创建微服务

```bash
# 产品服务
nest new product-service

# 订单服务
nest new order-service

# 用户服务
nest new user-service
```

---

## 核心实现

### 1. API网关

```typescript
// api-gateway/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 全局验证管道
  app.useGlobalPipes(new ValidationPipe());
  
  // CORS
  app.enableCors();
  
  await app.listen(3000);
  console.log('API Gateway running on http://localhost:3000');
}
bootstrap();

// api-gateway/src/app.module.ts
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    // GraphQL配置
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true,
    }),
    
    // 微服务客户端
    ClientsModule.register([
      {
        name: 'PRODUCT_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'product_queue',
          queueOptions: { durable: false },
        },
      },
      {
        name: 'ORDER_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'order_queue',
          queueOptions: { durable: false },
        },
      },
    ]),
  ],
})
export class AppModule {}
```

### 2. 产品微服务

```typescript
// product-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: ['amqp://localhost:5672'],
        queue: 'product_queue',
        queueOptions: { durable: false },
      },
    },
  );
  
  await app.listen();
  console.log('Product Service is listening');
}
bootstrap();

// product-service/src/products/products.controller.ts
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @MessagePattern({ cmd: 'get_products' })
  async getProducts(@Payload() data: any) {
    return this.productsService.findAll(data);
  }

  @MessagePattern({ cmd: 'get_product' })
  async getProduct(@Payload() id: number) {
    return this.productsService.findOne(id);
  }

  @MessagePattern({ cmd: 'create_product' })
  async createProduct(@Payload() data: any) {
    return this.productsService.create(data);
  }

  @MessagePattern({ cmd: 'update_product' })
  async updateProduct(@Payload() data: any) {
    return this.productsService.update(data.id, data);
  }

  @MessagePattern({ cmd: 'delete_product' })
  async deleteProduct(@Payload() id: number) {
    return this.productsService.remove(id);
  }
}

// product-service/src/products/products.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: any) {
    return this.prisma.product.findMany({
      where: params.where,
      skip: params.skip,
      take: params.take,
    });
  }

  async findOne(id: number) {
    return this.prisma.product.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return this.prisma.product.create({ data });
  }

  async update(id: number, data: any) {
    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
```

### 3. GraphQL API（网关）

```typescript
// api-gateway/src/products/products.resolver.ts
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Product } from './product.model';

@Resolver(() => Product)
export class ProductsResolver {
  constructor(
    @Inject('PRODUCT_SERVICE') private productClient: ClientProxy,
  ) {}

  @Query(() => [Product])
  async products() {
    return this.productClient.send({ cmd: 'get_products' }, {});
  }

  @Query(() => Product)
  async product(@Args('id') id: number) {
    return this.productClient.send({ cmd: 'get_product' }, id);
  }

  @Mutation(() => Product)
  async createProduct(@Args('input') input: any) {
    return this.productClient.send({ cmd: 'create_product' }, input);
  }
}

// api-gateway/src/products/product.model.ts
import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class Product {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  model: string;

  @Field(() => Float)
  price: number;

  @Field()
  category: string;

  @Field(() => Int)
  stock: number;
}
```

### 4. Prisma ORM配置

```prisma
// product-service/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Product {
  id              Int      @id @default(autoincrement())
  name            String
  model           String
  price           Decimal  @db.Decimal(10, 2)
  image           String?
  category        String
  innerDiameter   Decimal? @db.Decimal(10, 2)
  outerDiameter   Decimal? @db.Decimal(10, 2)
  width           Decimal? @db.Decimal(10, 2)
  stock           Int      @default(0)
  description     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([category])
  @@index([model])
}
```

---

## 服务间通信

### 1. RabbitMQ消息队列

```typescript
// 发送消息
this.productClient.send({ cmd: 'get_products' }, {}).subscribe();

// 发送事件（不等待响应）
this.productClient.emit('product_created', product);
```

### 2. gRPC通信

```typescript
// product-service/src/main.ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.GRPC,
    options: {
      package: 'product',
      protoPath: join(__dirname, './product.proto'),
      url: 'localhost:5000',
    },
  },
);
```

### 3. Redis发布订阅

```typescript
// 发布事件
await this.redis.publish('order_created', JSON.stringify(order));

// 订阅事件
this.redis.subscribe('order_created', (message) => {
  const order = JSON.parse(message);
  // 处理订单创建事件
});
```

---

## Docker Compose配置

```yaml
version: '3.8'

services:
  # RabbitMQ
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: admin

  # PostgreSQL
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: bearing_sales
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # API Gateway
  api-gateway:
    build: ./api-gateway
    ports:
      - "3000:3000"
    depends_on:
      - rabbitmq
      - product-service
      - order-service

  # Product Service
  product-service:
    build: ./product-service
    depends_on:
      - rabbitmq
      - postgres
    environment:
      DATABASE_URL: postgresql://admin:password@postgres:5432/bearing_sales

  # Order Service
  order-service:
    build: ./order-service
    depends_on:
      - rabbitmq
      - postgres
```

---

## Kubernetes部署

```yaml
# product-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: product-service
  template:
    metadata:
      labels:
        app: product-service
    spec:
      containers:
      - name: product-service
        image: bearing-sales/product-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: RABBITMQ_URL
          value: "amqp://rabbitmq:5672"
---
apiVersion: v1
kind: Service
metadata:
  name: product-service
spec:
  selector:
    app: product-service
  ports:
  - port: 3001
    targetPort: 3001
```

---

## 监控和日志

### Prometheus监控

```typescript
// 安装依赖
npm install @willsoto/nestjs-prometheus prom-client

// app.module.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register(),
  ],
})
export class AppModule {}
```

### 日志聚合

```typescript
// 使用Winston
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

WinstonModule.forRoot({
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

---

## 迁移步骤

### 1. 准备阶段
- 分析现有系统
- 设计微服务边界
- 准备基础设施

### 2. 创建服务
- 创建NestJS项目
- 配置Prisma ORM
- 实现业务逻辑

### 3. 配置通信
- 设置RabbitMQ
- 配置服务发现
- 实现API网关

### 4. 数据迁移
- 迁移数据库
- 同步数据
- 验证数据

### 5. 测试和部署
- 单元测试
- 集成测试
- 灰度发布

---

## 优势

### 技术优势
- ✅ 独立部署和扩展
- ✅ 技术栈灵活
- ✅ 故障隔离
- ✅ 易于维护

### 业务优势
- ✅ 快速迭代
- ✅ 团队独立
- ✅ 高可用性
- ✅ 易于扩展

---

## 总结

NestJS微服务架构提供：

- ✅ 企业级框架
- ✅ TypeScript支持
- ✅ 微服务通信
- ✅ GraphQL支持
- ✅ 完整的生态系统

适合大规模企业应用。
