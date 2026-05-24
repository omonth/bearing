const express = require('express');
const router = express.Router();
const logger = require('../logger');

module.exports = function(db, aiService) {

  // ==================== Smart Chatbot ====================

  router.post('/chat', async (req, res) => {
    try {
      const { message, context } = req.body;
      if (!message) return res.status(400).json({ error: '请输入消息' });

      const result = await aiService.chat(message, context || {});

      if (result.stream) {
        // SSE streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = result.stream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.write('data: [DONE]\n\n'); res.end(); break; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return; }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
              } catch { /* skip malformed chunks */ }
            }
          }
        }
      } else {
        res.json(result);
      }
    } catch (error) {
      logger.error('AI聊天失败', { error: error.message });
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });

  router.post('/reindex', async (req, res) => {
    try {
      if (aiService.ragEngine) {
        await aiService.ragEngine.buildIndex();
        res.json({ message: '索引重建完成' });
      } else {
        res.status(400).json({ error: 'RAG引擎未初始化' });
      }
    } catch (error) {
      logger.error('重建索引失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/admin-chat', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: '请输入问题' });
      const result = await aiService.adminChat(message);
      res.json(result);
    } catch (error) {
      logger.error('Admin AI失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Demand Prediction ====================

  // Predict demand for a specific product
  router.get('/predict-demand/:productId', async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const prediction = await aiService.predictDemand(
        parseInt(req.params.productId),
        parseInt(days)
      );
      res.json(prediction);
    } catch (error) {
      logger.error('需求预测失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Predict demand for all products
  router.get('/predict-demand', async (req, res) => {
    try {
      const predictions = await aiService.predictAllDemand();
      res.json(predictions);
    } catch (error) {
      logger.error('全量需求预测失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Smart Recommendations ====================

  router.get('/recommendations', async (req, res) => {
    try {
      const { customerPhone, limit = 10 } = req.query;
      const result = await aiService.getSmartRecommendations(
        customerPhone || null,
        parseInt(limit)
      );
      res.json(result);
    } catch (error) {
      logger.error('智能推荐失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Sales Forecasting ====================

  router.get('/forecast', async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const forecast = await aiService.forecastSales(parseInt(days));
      res.json(forecast);
    } catch (error) {
      logger.error('销售预测失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Image Recognition (Simulated) ====================

  router.post('/image-recognize', async (req, res) => {
    try {
      // In production, this would use TensorFlow.js or a cloud vision API
      // For now, returns a simulated product recognition result
      const { imageUrl, description } = req.body;

      // Simulate product matching based on description keywords
      let matchedProducts = [];
      if (description) {
        const keywords = description.split(/[,，\s]+/).filter(k => k.length > 1);
        for (const keyword of keywords) {
          const products = await db.all(
            'SELECT * FROM bearings WHERE name LIKE ? OR model LIKE ? OR description LIKE ? LIMIT 3',
            [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
          );
          matchedProducts.push(...products);
        }
      }

      // Deduplicate
      const seen = new Set();
      matchedProducts = matchedProducts.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }).slice(0, 5);

      res.json({
        recognized: matchedProducts.length > 0,
        confidence: matchedProducts.length > 0 ? 0.85 : 0.1,
        products: matchedProducts.map(p => ({
          id: p.id,
          name: p.name,
          model: p.model,
          price: p.price,
          category: p.category,
          image: p.image
        })),
        suggestions: matchedProducts.length === 0
          ? ['请提供更清晰的图片', '描述产品特征', '联系客服识别']
          : []
      });
    } catch (error) {
      logger.error('图像识别失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
