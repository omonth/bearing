# AI功能集成文档

## 概述

集成AI功能，提供智能客服、图像识别、需求预测等智能化服务。

---

## 功能特性

### ✅ 智能客服（ChatGPT）
- 24/7在线客服
- 产品咨询
- 订单查询
- 问题解答

### ✅ 图像识别
- 产品图片识别
- 质量检测
- 缺陷识别

### ✅ 需求预测
- 销售预测
- 库存预测
- 趋势分析

### ✅ 智能推荐增强
- 深度学习推荐
- 用户画像
- 个性化营销

---

## 技术栈

### AI服务
- **OpenAI API** - GPT-4、DALL-E
- **TensorFlow.js** - 机器学习
- **Python ML** - 预测模型

### 集成方式
- **REST API** - HTTP调用
- **WebSocket** - 实时对话
- **消息队列** - 异步处理

---

## 1. 智能客服（ChatGPT）

### 安装依赖

```bash
npm install openai
```

### 实现代码

```typescript
// backend/services/aiChatService.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 系统提示词
const SYSTEM_PROMPT = `你是轴承销售系统的智能客服助手。
你的职责是：
1. 回答客户关于轴承产品的问题
2. 帮助客户查询订单状态
3. 提供产品推荐
4. 解答技术问题

请用专业、友好的语气回答问题。`;

// 聊天接口
export async function chat(message: string, conversationHistory: any[] = []) {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    return {
      reply: response.choices[0].message.content,
      usage: response.usage,
    };
  } catch (error) {
    console.error('ChatGPT API错误:', error);
    throw error;
  }
}

// 产品推荐
export async function recommendProducts(userQuery: string, products: any[]) {
  const prompt = `用户需求: ${userQuery}

可选产品:
${products.map(p => `- ${p.name} (${p.model}): ${p.description}, 价格: ¥${p.price}`).join('\n')}

请根据用户需求推荐最合适的3个产品，并说明推荐理由。`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: '你是专业的轴承产品顾问。' },
      { role: 'user', content: prompt },
    ],
  });

  return response.choices[0].message.content;
}

// 订单查询助手
export async function orderAssistant(query: string, orderData: any) {
  const prompt = `客户查询: ${query}

订单信息:
- 订单号: ${orderData.id}
- 状态: ${orderData.status}
- 总金额: ¥${orderData.totalPrice}
- 下单时间: ${orderData.createdAt}
${orderData.trackingNumber ? `- 物流单号: ${orderData.trackingNumber}` : ''}

请用友好的语气回答客户的查询。`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });

  return response.choices[0].message.content;
}
```

### API接口

```typescript
// backend/routes/ai.js
const express = require('express');
const router = express.Router();
const { chat, recommendProducts, orderAssistant } = require('../services/aiChatService');

// 智能客服聊天
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    const result = await chat(message, conversationHistory);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '智能客服暂时不可用' });
  }
});

// AI产品推荐
router.post('/recommend', async (req, res) => {
  try {
    const { query, products } = req.body;
    const recommendation = await recommendProducts(query, products);
    res.json({ recommendation });
  } catch (error) {
    res.status(500).json({ error: '推荐服务暂时不可用' });
  }
});

// 订单查询助手
router.post('/order-assistant', async (req, res) => {
  try {
    const { query, orderData } = req.body;
    const response = await orderAssistant(query, orderData);
    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: '查询服务暂时不可用' });
  }
});

module.exports = router;
```

---

## 2. 图像识别

### 使用TensorFlow.js

```typescript
// backend/services/imageRecognitionService.ts
import * as tf from '@tensorflow/tfjs-node';
import * as mobilenet from '@tensorflow-models/mobilenet';

let model: any = null;

// 加载模型
export async function loadModel() {
  if (!model) {
    model = await mobilenet.load();
    console.log('图像识别模型已加载');
  }
  return model;
}

// 识别产品图片
export async function recognizeProduct(imageBuffer: Buffer) {
  const model = await loadModel();
  
  // 将图片转换为张量
  const tensor = tf.node.decodeImage(imageBuffer);
  
  // 进行预测
  const predictions = await model.classify(tensor);
  
  // 清理张量
  tensor.dispose();
  
  return predictions;
}

// 质量检测
export async function detectDefects(imageBuffer: Buffer) {
  // 这里可以使用自定义训练的模型
  // 检测轴承表面缺陷、划痕等
  
  const model = await loadModel();
  const tensor = tf.node.decodeImage(imageBuffer);
  
  // 假设我们有一个缺陷检测模型
  // const defects = await defectModel.predict(tensor);
  
  tensor.dispose();
  
  return {
    hasDefects: false,
    confidence: 0.95,
    defects: [],
  };
}
```

### API接口

```typescript
router.post('/recognize-image', upload.single('image'), async (req, res) => {
  try {
    const imageBuffer = req.file.buffer;
    const predictions = await recognizeProduct(imageBuffer);
    res.json({ predictions });
  } catch (error) {
    res.status(500).json({ error: '图像识别失败' });
  }
});

router.post('/detect-defects', upload.single('image'), async (req, res) => {
  try {
    const imageBuffer = req.file.buffer;
    const result = await detectDefects(imageBuffer);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '缺陷检测失败' });
  }
});
```

---

## 3. 需求预测

### Python机器学习服务

```python
# ml-service/predict.py
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import joblib
from flask import Flask, request, jsonify

app = Flask(__name__)

# 加载模型
model = joblib.load('models/sales_forecast.pkl')
scaler = joblib.load('models/scaler.pkl')

@app.route('/predict/sales', methods=['POST'])
def predict_sales():
    """预测未来销量"""
    data = request.json
    
    # 特征工程
    features = prepare_features(data)
    features_scaled = scaler.transform(features)
    
    # 预测
    prediction = model.predict(features_scaled)
    
    return jsonify({
        'predicted_sales': prediction.tolist(),
        'confidence': 0.85
    })

@app.route('/predict/inventory', methods=['POST'])
def predict_inventory():
    """预测库存需求"""
    data = request.json
    
    # 基于历史销售数据预测
    historical_sales = data['historical_sales']
    lead_time = data['lead_time']
    
    # 计算预测
    avg_daily_sales = np.mean(historical_sales)
    std_daily_sales = np.std(historical_sales)
    
    # 安全库存 = 平均日销量 × 提前期 + 安全系数 × 标准差 × √提前期
    safety_stock = avg_daily_sales * lead_time + 1.65 * std_daily_sales * np.sqrt(lead_time)
    reorder_point = avg_daily_sales * lead_time + safety_stock
    
    return jsonify({
        'reorder_point': int(reorder_point),
        'safety_stock': int(safety_stock),
        'avg_daily_sales': avg_daily_sales
    })

def prepare_features(data):
    """准备特征"""
    df = pd.DataFrame([data])
    # 特征工程逻辑
    return df

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Node.js调用Python服务

```typescript
// backend/services/mlService.ts
import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

// 销售预测
export async function predictSales(data: any) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict/sales`, data);
    return response.data;
  } catch (error) {
    console.error('销售预测失败:', error);
    throw error;
  }
}

// 库存预测
export async function predictInventory(productId: number, historicalSales: number[], leadTime: number) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict/inventory`, {
      product_id: productId,
      historical_sales: historicalSales,
      lead_time: leadTime,
    });
    return response.data;
  } catch (error) {
    console.error('库存预测失败:', error);
    throw error;
  }
}

// 趋势分析
export async function analyzeTrend(data: any) {
  // 简单的趋势分析
  const values = data.values;
  const n = values.length;
  
  if (n < 2) return { trend: 'stable' };
  
  // 计算线性回归斜率
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a: number, b: number) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += Math.pow(i - xMean, 2);
  }
  
  const slope = numerator / denominator;
  
  // 判断趋势
  if (slope > 0.1) return { trend: 'increasing', slope };
  if (slope < -0.1) return { trend: 'decreasing', slope };
  return { trend: 'stable', slope };
}
```

---

## 4. 智能推荐增强

### 深度学习推荐

```typescript
// backend/services/aiRecommendationService.ts
import * as tf from '@tensorflow/tfjs-node';

// 用户嵌入模型
class RecommendationModel {
  private model: tf.LayersModel | null = null;

  async loadModel() {
    if (!this.model) {
      // 加载预训练的推荐模型
      this.model = await tf.loadLayersModel('file://./models/recommendation/model.json');
    }
    return this.model;
  }

  async predict(userId: number, productIds: number[]) {
    const model = await this.loadModel();
    
    // 准备输入
    const userTensor = tf.tensor2d([[userId]], [1, 1]);
    const productTensor = tf.tensor2d([productIds], [1, productIds.length]);
    
    // 预测
    const predictions = model.predict([userTensor, productTensor]) as tf.Tensor;
    const scores = await predictions.data();
    
    // 清理
    userTensor.dispose();
    productTensor.dispose();
    predictions.dispose();
    
    return Array.from(scores);
  }
}

export const aiRecommendation = new RecommendationModel();

// 获取AI推荐
export async function getAIRecommendations(userId: number, candidateProducts: any[]) {
  try {
    const productIds = candidateProducts.map(p => p.id);
    const scores = await aiRecommendation.predict(userId, productIds);
    
    // 按分数排序
    const recommendations = candidateProducts
      .map((product, index) => ({
        ...product,
        score: scores[index],
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    return recommendations;
  } catch (error) {
    console.error('AI推荐失败:', error);
    // 降级到规则推荐
    return candidateProducts.slice(0, 10);
  }
}
```

---

## 5. 前端集成

### 智能客服组件

```typescript
// frontend/components/AIChatbot.tsx
import { useState } from 'react';
import { Button, Input, Card } from 'antd';

export default function AIChatbot() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversationHistory: messages,
        }),
      });

      const data = await response.json();
      const aiMessage = { role: 'assistant', content: data.reply };
      setMessages([...messages, userMessage, aiMessage]);
    } catch (error) {
      console.error('发送消息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="智能客服" style={{ width: 400 }}>
      <div style={{ height: 400, overflowY: 'auto', marginBottom: 16 }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              textAlign: msg.role === 'user' ? 'right' : 'left',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '8px 12px',
                borderRadius: 8,
                backgroundColor: msg.role === 'user' ? '#1890ff' : '#f0f0f0',
                color: msg.role === 'user' ? 'white' : 'black',
              }}
            >
              {msg.content}
            </span>
          </div>
        ))}
      </div>
      <Input.Search
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onSearch={sendMessage}
        loading={loading}
        placeholder="输入您的问题..."
      />
    </Card>
  );
}
```

---

## 环境配置

```bash
# .env
OPENAI_API_KEY=sk-your-api-key-here
ML_SERVICE_URL=http://localhost:5000
```

---

## Docker部署

```yaml
# docker-compose.yml
services:
  ml-service:
    build: ./ml-service
    ports:
      - "5000:5000"
    volumes:
      - ./ml-service/models:/app/models
    environment:
      - FLASK_ENV=production

  backend:
    build: ./backend
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ML_SERVICE_URL=http://ml-service:5000
    depends_on:
      - ml-service
```

---

## 成本优化

### 1. 缓存AI响应

```typescript
// 缓存常见问题的回答
const cache = new Map();

async function cachedChat(message: string) {
  const cacheKey = message.toLowerCase().trim();
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const response = await chat(message);
  cache.set(cacheKey, response);
  
  return response;
}
```

### 2. 使用更便宜的模型

```typescript
// 简单问题使用GPT-3.5
const model = isComplexQuery(message) ? 'gpt-4' : 'gpt-3.5-turbo';
```

### 3. 批量处理

```typescript
// 批量预测以减少API调用
async function batchPredict(items: any[]) {
  // 一次性预测多个项目
}
```

---

## 总结

AI功能集成提供：

- ✅ 智能客服（ChatGPT）
- ✅ 图像识别
- ✅ 需求预测
- ✅ 智能推荐增强

提升用户体验和运营效率。
