const logger = require('../logger');
const { NotFoundError, ValidationError, BusinessError } = require('../utils/errors');

class BearingService {
  constructor(db, clearCacheFn, ragEngine) {
    this.db = db;
    this.clearCache = clearCacheFn || (() => {});
    this.ragEngine = ragEngine;
  }

  _parseJsonField(value) {
    if (!value) return { zh: '', en: '' };
    try { return JSON.parse(value); } catch { return { zh: value, en: '' }; }
  }

  _ensureJsonField(value) {
    if (!value) return JSON.stringify({ zh: '', en: '' });
    if (typeof value !== 'string') return JSON.stringify(value);
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && 'zh' in parsed) return value;
    } catch { /* plain string */ }
    return JSON.stringify({ zh: value, en: '' });
  }

  _mapRow(row) {
    return {
      id: row.id, name: this._parseJsonField(row.name), model: row.model,
      price: Number(row.price), image: row.image, category: row.category,
      specs: {
        innerDiameter: parseFloat(row.inner_diameter) || row.inner_diameter,
        outerDiameter: parseFloat(row.outer_diameter) || row.outer_diameter,
        width: parseFloat(row.width) || row.width
      },
      stock: Number(row.stock), description: this._parseJsonField(row.description)
    };
  }

  async list(category) {
    let query = 'SELECT * FROM bearings';
    const params = [];
    if (category && category !== '全部') { query += ' WHERE category = ?'; params.push(category); }
    const rows = await this.db.all(query, params);
    const bearings = rows.map(row => this._mapRow(row));
    logger.info('获取轴承列表成功', { count: bearings.length, category });
    return bearings;
  }

  async getById(id) {
    const row = await this.db.get('SELECT * FROM bearings WHERE id = ?', [id]);
    if (!row) throw new NotFoundError('产品');
    return this._mapRow(row);
  }

  async getCategories() {
    const rows = await this.db.all('SELECT DISTINCT category FROM bearings', []);
    return rows.map(row => row.category);
  }

  async search({ q, category, minPrice, maxPrice, minStock, inStock, sortBy, order }) {
    let query = '';
    let params = [];
    if (q && q.trim()) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      query = `SELECT * FROM bearings
        WHERE LOWER(model) LIKE ?
          OR LOWER(name) LIKE ?
          OR LOWER(category) LIKE ?
          OR LOWER(description) LIKE ?`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    } else {
      query = 'SELECT * FROM bearings WHERE 1=1';
    }
    if (category && category !== '全部') { query += ' AND category = ?'; params.push(category); }
    if (minPrice) { query += ' AND price >= ?'; params.push(parseFloat(minPrice)); }
    if (maxPrice) { query += ' AND price <= ?'; params.push(parseFloat(maxPrice)); }
    if (minStock) { query += ' AND stock >= ?'; params.push(parseInt(minStock)); }
    if (inStock === 'true') { query += ' AND stock > 0'; }
    const validSortFields = ['price', 'stock', 'name', 'created_at'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'id';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    const rows = await this.db.all(query, params);
    const results = rows.map(row => this._mapRow(row));
    logger.info('搜索成功', { count: results.length });
    return { total: results.length, results };
  }

  async searchSuggestions(q) {
    if (!q || q.trim().length < 2) return [];
    const rows = await this.db.all(
      'SELECT DISTINCT name, model FROM bearings WHERE model LIKE ? LIMIT 10',
      [`%${q.trim()}%`]
    );
    return rows.map(row => ({ name: typeof row.name === 'string' ? this._parseJsonField(row.name).zh : row.name, model: row.model }));
  }

  async create({ name, model, price, category, innerDiameter, outerDiameter, width, stock, image, description }) {
    const normalizedName = this._ensureJsonField(name);
    const normalizedDescription = this._ensureJsonField(description);
    const result = await this.db.run(
      'INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, image, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [normalizedName, model, price, category, innerDiameter, outerDiameter, width, stock, image, normalizedDescription]
    );
    this.clearCache('bearings:*');
    this.clearCache('categories:*');

    // Sync RAG index
    if (this.ragEngine) {
      const bearing = await this.db.get('SELECT * FROM bearings WHERE id = ?', [result.lastID]);
      if (bearing) this.ragEngine.addProduct(bearing).catch(e => logger.warn('RAG同步失败', { error: e.message }));
    }

    return { id: result.lastID, message: '产品添加成功' };
  }

  async delete(id) {
    await this.db.run('DELETE FROM bearings WHERE id = ?', [id]);
    this.clearCache('bearings:*');

    // Sync RAG index
    if (this.ragEngine) {
      this.ragEngine.removeProduct(id).catch(e => logger.warn('RAG同步失败', { error: e.message }));
    }

    return { message: '产品删除成功' };
  }

  async update(id, fields) {
    const allowed = ['name', 'model', 'price', 'category', 'stock', 'description', 'inner_diameter', 'outer_diameter', 'width'];
    const jsonFields = ['name', 'description'];
    const keys = Object.keys(fields).filter(k => allowed.includes(k));
    if (keys.length === 0) throw new ValidationError('无可更新字段');
    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => jsonFields.includes(k) ? this._ensureJsonField(fields[k]) : fields[k]);
    values.push(id);
    await this.db.run(`UPDATE bearings SET ${setClauses} WHERE id = ?`, values);
    this.clearCache('bearings:*');

    // Sync RAG index
    if (this.ragEngine) {
      const bearing = await this.db.get('SELECT * FROM bearings WHERE id = ?', [id]);
      if (bearing) this.ragEngine.updateProduct(bearing).catch(e => logger.warn('RAG同步失败', { error: e.message }));
    }

    return { message: '产品更新成功' };
  }

  async updateStock(id, stock) {
    await this.db.run('UPDATE bearings SET stock = ? WHERE id = ?', [stock, id]);
    this.clearCache('bearings:*');
    return { message: '库存更新成功' };
  }

  async updateImage(id, imageUrl) {
    await this.db.run('UPDATE bearings SET image = ? WHERE id = ?', [imageUrl, id]);
    this.clearCache('bearings:*');
    logger.info('产品图片已更新', { bearingId: id, image: imageUrl });
    return { message: '产品图片已更新', url: imageUrl };
  }

  async getImagePath(id) {
    const row = await this.db.get('SELECT image FROM bearings WHERE id = ?', [id]);
    return row;
  }
}

module.exports = BearingService;
