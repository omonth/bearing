const logger = require('../logger');

class RAGEngine {
  constructor(db, apiKey) {
    this.db = db;
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY;
    this.baseUrl = 'https://api.deepseek.com';
  }

  async _embed(text) {
    const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', input: text }),
    });
    if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
    const data = await res.json();
    return data.data[0].embedding;
  }

  async _ensureTable() {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS rag_vectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id INTEGER,
        content TEXT NOT NULL,
        vector TEXT NOT NULL
      )
    `);
  }

  async buildIndex() {
    await this._ensureTable();
    await this.db.run('DELETE FROM rag_vectors');

    // Index bearing products
    const bearings = await this.db.all('SELECT id, name, model, category, price, stock, description FROM bearings');
    for (const b of bearings) {
      try {
        const nameObj = JSON.parse(b.name || '{}');
        const descObj = JSON.parse(b.description || '{}');
        const text = `${nameObj.zh || ''} ${b.model} ${b.category} ${descObj.zh || ''}`.trim();
        if (!text) continue;
        const vector = await this._embed(text);
        await this.db.run('INSERT INTO rag_vectors (source_type, source_id, content, vector) VALUES (?, ?, ?, ?)',
          ['bearing', b.id, text, JSON.stringify(vector)]);
      } catch (e) { logger.warn('RAG index skip', { id: b.id, error: e.message }); }
    }

    // Index FAQ
    const faqs = [
      { q: '如何下单', a: '在商品页面选择轴承，点击"加入购物车"，然后进入结算页面填写收货地址并提交订单。' },
      { q: '如何查询订单', a: '登录账户后，在"我的账户"页面可以查看所有历史订单和物流状态。' },
      { q: '支付方式有哪些', a: '支持微信支付、支付宝和货到付款三种支付方式。' },
      { q: '如何退货', a: '收到货物后7天内可申请退货。请联系客服并提供订单号。' },
      { q: '发货时间', a: '订单支付后24小时内发货，一般3-5个工作日送达。' },
      { q: '轴承型号怎么选', a: '根据设备的内径、外径、宽度和载荷类型选择合适的轴承型号。可以搜索型号或咨询客服。' },
      { q: '有没有优惠', a: '注册会员可享受积分累积和会员折扣，还可以使用优惠券抵扣。' },
      { q: '批量购买有折扣吗', a: '批量采购请联系客服获取报价，大额订单可享受额外折扣。' },
    ];
    for (const faq of faqs) {
      try {
        const vector = await this._embed(faq.q);
        await this.db.run('INSERT INTO rag_vectors (source_type, source_id, content, vector) VALUES (?, ?, ?, ?)',
          ['faq', null, faq.q + '\n' + faq.a, JSON.stringify(vector)]);
      } catch (e) { logger.warn('RAG FAQ skip', { error: e.message }); }
    }

    logger.info('RAG索引构建完成');
  }

  async search(query, topK = 5) {
    try {
      const queryVec = await this._embed(query);
      const rows = await this.db.all('SELECT * FROM rag_vectors');

      const scored = rows.map(row => {
        const vec = JSON.parse(row.vector);
        const similarity = this._cosineSimilarity(queryVec, vec);
        return { ...row, similarity };
      });

      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, topK);
    } catch (e) {
      logger.error('RAG搜索失败', { error: e.message });
      return [];
    }
  }

  _cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  async chat(prompt, history = []) {
    const messages = [
      { role: 'system', content: '你是轴承销售系统的智能客服。回答要简洁专业，基于提供的上下文信息。用中文回答。' },
      ...history,
      { role: 'user', content: prompt },
    ];

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, stream: true }),
    });
    return res;
  }
}

module.exports = RAGEngine;
