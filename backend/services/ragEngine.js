const logger = require('../logger');

const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://localhost:5050';

class RAGEngine {
  constructor(db, apiKey) {
    this.db = db;
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY;
    this.baseUrl = 'https://api.deepseek.com';
    this.vectorUrl = VECTOR_SERVICE_URL;
  }

  // ── Vector service helpers ──────────────────────────────────────────────

  async _vectorRequest(path, body) {
    const res = await fetch(`${this.vectorUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vector service ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  async _vectorHealth() {
    try {
      const res = await fetch(`${this.vectorUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Build product text for embedding ────────────────────────────────────

  _buildProductText(b) {
    const name = this._parseJsonField(b.name);
    const desc = this._parseJsonField(b.description);
    const parts = [
      name,
      b.model,
      b.category,
      desc,
      b.inner_diameter ? `内径${b.inner_diameter}` : '',
      b.outer_diameter ? `外径${b.outer_diameter}` : '',
      b.width ? `宽度${b.width}` : '',
    ].filter(Boolean);
    return parts.join(' ');
  }

  _parseJsonField(val) {
    if (!val) return '';
    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;
      return obj.zh || obj.en || '';
    } catch {
      return val;
    }
  }

  // ── Full index build ───────────────────────────────────────────────────

  async buildIndex() {
    const healthy = await this._vectorHealth();
    if (!healthy) {
      logger.warn('Vector service unavailable, skipping index build');
      return;
    }

    logger.info('Building RAG index via vector service...');

    const bearings = await this.db.all(
      'SELECT id, name, model, category, price, stock, description, inner_diameter, outer_diameter, width FROM bearings'
    );

    const products = bearings.map(b => ({
      id: b.id,
      text: this._buildProductText(b),
      source_type: 'bearing',
    }));

    if (products.length === 0) {
      logger.warn('No bearings found for indexing');
      return;
    }

    const result = await this._vectorRequest('/index/build', { products });
    logger.info('RAG index built', { count: result.count });
  }

  // ── Incremental updates ────────────────────────────────────────────────

  async addProduct(bearing) {
    const healthy = await this._vectorHealth();
    if (!healthy) return;

    await this._vectorRequest('/index/add', {
      products: [{
        id: bearing.id,
        text: this._buildProductText(bearing),
        source_type: 'bearing',
      }],
    });
  }

  async updateProduct(bearing) {
    const healthy = await this._vectorHealth();
    if (!healthy) return;

    await this._vectorRequest('/index/update', {
      products: [{
        id: bearing.id,
        text: this._buildProductText(bearing),
        source_type: 'bearing',
      }],
    });
  }

  async removeProduct(bearingId) {
    const healthy = await this._vectorHealth();
    if (!healthy) return;

    await this._vectorRequest('/index/remove', { ids: [bearingId] });
  }

  // ── Search ─────────────────────────────────────────────────────────────

  async search(query, topK = 5) {
    try {
      const healthy = await this._vectorHealth();
      if (!healthy) {
        logger.warn('Vector service unavailable for search');
        return [];
      }

      const result = await this._vectorRequest('/search', { query, top_k: topK });
      return result.results || [];
    } catch (e) {
      logger.error('RAG search failed', { error: e.message });
      return [];
    }
  }

  // ── Chat (DeepSeek) ────────────────────────────────────────────────────

  async chat(prompt, history = []) {
    const messages = [
      {
        role: 'system',
        content: '你是轴承销售系统的智能客服。回答要简洁专业，基于提供的上下文信息。用中文回答。如果检索到的产品信息相关，可以推荐具体产品。',
      },
      ...history,
      { role: 'user', content: prompt },
    ];

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: 'deepseek-chat', messages, stream: true }),
    });
    return res;
  }
}

module.exports = RAGEngine;
