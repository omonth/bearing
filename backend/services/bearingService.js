const logger = require('../logger');

class BearingService {
  constructor(db, clearCacheFn) {
    this.db = db;
    this.clearCache = clearCacheFn || (() => {});
  }

  _mapRow(row) {
    return {
      id: row.id, name: row.name, model: row.model,
      price: Number(row.price), image: row.image, category: row.category,
      specs: {
        innerDiameter: Number(row.inner_diameter),
        outerDiameter: Number(row.outer_diameter),
        width: Number(row.width)
      },
      stock: Number(row.stock), description: row.description
    };
  }

  async list(category) {
    try {
      let query = 'SELECT * FROM bearings';
      const params = [];
      if (category && category !== '全部') { query += ' WHERE category = ?'; params.push(category); }
      const rows = await this.db.all(query, params);
      const bearings = rows.map(row => this._mapRow(row));
      logger.info('获取轴承列表成功', { count: bearings.length, category });
      return { data: bearings, error: null };
    } catch (err) {
      logger.error('获取轴承列表失败', { error: err.message });
      return { data: null, error: '获取产品列表失败', status: 500 };
    }
  }

  async getById(id) {
    try {
      const row = await this.db.get('SELECT * FROM bearings WHERE id = ?', [id]);
      if (!row) return { data: null, error: '产品未找到', status: 404 };
      return { data: this._mapRow(row), error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async getCategories() {
    try {
      const rows = await this.db.all('SELECT DISTINCT category FROM bearings', []);
      return { data: rows.map(row => row.category), error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async search({ q, category, minPrice, maxPrice, minStock, inStock, sortBy, order }) {
    try {
      let query = '';
      let params = [];
      if (q && q.trim()) {
        query = 'SELECT b.* FROM bearings b INNER JOIN bearings_fts fts ON b.id = fts.id WHERE bearings_fts MATCH ?';
        params.push(q.trim());
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
      return { data: { total: results.length, results }, error: null };
    } catch (err) {
      logger.error('搜索失败', { error: err.message });
      return { data: null, error: '搜索失败', status: 500 };
    }
  }

  async searchSuggestions(q) {
    if (!q || q.trim().length < 2) return { data: [], error: null };
    try {
      const rows = await this.db.all(
        'SELECT DISTINCT name, model FROM bearings_fts WHERE bearings_fts MATCH ? LIMIT 10',
        [`${q.trim()}*`]
      );
      return { data: rows.map(row => ({ name: row.name, model: row.model })), error: null };
    } catch (err) {
      logger.error('获取搜索建议失败', { error: err.message });
      return { data: [], error: null };
    }
  }

  async create({ name, model, price, category, innerDiameter, outerDiameter, width, stock, image, description }) {
    try {
      const result = await this.db.run(
        'INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, image, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, model, price, category, innerDiameter, outerDiameter, width, stock, image, description]
      );
      this.clearCache('bearings:*');
      this.clearCache('categories:*');
      return { data: { id: result.lastID, message: '产品添加成功' }, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async delete(id) {
    try {
      await this.db.run('DELETE FROM bearings WHERE id = ?', [id]);
      this.clearCache('bearings:*');
      return { data: { message: '产品删除成功' }, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async updateStock(id, stock) {
    try {
      await this.db.run('UPDATE bearings SET stock = ? WHERE id = ?', [stock, id]);
      this.clearCache('bearings:*');
      return { data: { message: '库存更新成功' }, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async updateImage(id, imageUrl) {
    try {
      await this.db.run('UPDATE bearings SET image = ? WHERE id = ?', [imageUrl, id]);
      this.clearCache('bearings:*');
      logger.info('产品图片已更新', { bearingId: id, image: imageUrl });
      return { data: { message: '产品图片已更新', url: imageUrl }, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async getImagePath(id) {
    try {
      const row = await this.db.get('SELECT image FROM bearings WHERE id = ?', [id]);
      return { data: row, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }
}

module.exports = BearingService;
