const express = require('express');
const logger = require('../logger');

module.exports = function(db, aiService, aiAuthService, bearingService, requireAIRole) {
  const router = express.Router();

  // Parse modification intent using DeepSeek
  async function parseModificationIntent(message) {
    const schema = `
数据库表: bearings
字段: id(整数), name(JSON{"zh":"","en":""}), model(文本), price(实数), category(文本), stock(整数), description(JSON{"zh":"","en":""}), inner_diameter(实数), outer_diameter(实数), width(实数)

用户会用自然语言描述要修改的内容。你需要：
1. 先查询匹配的产品（用 SELECT）
2. 解析出要修改的字段和新值

返回纯 JSON（不要 markdown 代码块）:
{
  "action": "find_and_update",
  "find_query": "SELECT * FROM bearings WHERE ... (用于找到目标产品)",
  "field": "要修改的字段名",
  "new_value": "新值（字符串，如果是 JSON 字段则用 JSON 字符串）",
  "reason": "一句话说明修改原因"
}

规则:
- 只处理 update 操作
- find_query 必须是 SELECT
- 如果无法确定目标产品，返回 {"error": "无法确定目标产品，请提供更具体的描述"}
- 如果无法确定修改内容，返回 {"error": "无法确定要修改的内容"}`;

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiService.ragEngine?.apiKey || process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: schema },
          { role: 'user', content: message },
        ],
        temperature: 0.1,
      }),
    });

    const data = await res.json();
    const content = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(content);
    } catch {
      return { error: 'AI 无法解析修改意图' };
    }
  }

  // POST /api/ai/modify-product
  router.post('/', requireAIRole('editor', 'admin'), async (req, res) => {
    try {
      const { message, dryRun } = req.body;
      if (!message) return res.status(400).json({ error: '请输入修改指令' });

      // 1. Parse intent
      const intent = await parseModificationIntent(message);
      if (intent.error) {
        return res.json({ error: intent.error });
      }

      // 2. Find target product
      // Validate LLM-generated SQL — only SELECT allowed, block all mutation keywords
      const BLOCKED_KEYWORDS = /\b(DROP|DELETE|INSERT|UPDATE|ALTER|TRUNCATE|CREATE|EXEC|EXECUTE|GRANT|REVOKE|LOAD_FILE|INTO\s+(OUTFILE|DUMPFILE)|SLEEP|BENCHMARK|WAITFOR)\b/i;
      if (!intent.find_query || typeof intent.find_query !== 'string') {
        return res.json({ error: 'AI 生成的查询无效' });
      }
      if (!/^\s*SELECT\b/i.test(intent.find_query)) {
        return res.json({ error: '只允许 SELECT 查询' });
      }
      if (BLOCKED_KEYWORDS.test(intent.find_query)) {
        return res.json({ error: '查询包含禁止的关键词' });
      }
      if (intent.find_query.length > 2000) {
        return res.json({ error: '查询语句过长' });
      }
      const safeSql = intent.find_query.includes('LIMIT') ? intent.find_query : `${intent.find_query} LIMIT 10`;
      let rows;
      try {
        rows = await db.all(safeSql, []);
      } catch (e) {
        return res.json({ error: `查询失败: ${e.message}` });
      }

      if (!rows || rows.length === 0) {
        return res.json({ error: '未找到匹配的产品' });
      }

      if (rows.length > 1) {
        return res.json({
          error: `找到 ${rows.length} 个匹配产品，请提供更具体的描述`,
          matches: rows.slice(0, 5).map(r => ({ id: r.id, name: r.name, model: r.model })),
        });
      }

      const product = rows[0];
      const field = intent.field;
      const newValue = intent.new_value;

      // Validate field
      const allowedFields = ['name', 'model', 'price', 'category', 'stock', 'description', 'inner_diameter', 'outer_diameter', 'width'];
      if (!allowedFields.includes(field)) {
        return res.json({ error: `不允许修改字段: ${field}` });
      }

      // Get old value
      const oldValue = product[field];

      // Build preview
      const preview = {
        id: product.id,
        name: typeof product.name === 'string' ? (() => { try { return JSON.parse(product.name).zh; } catch { return product.name; } })() : product.name,
        model: product.model,
        field,
        oldValue: String(oldValue),
        newValue: String(newValue),
        reason: intent.reason || '',
      };

      // Dry run - return preview only
      if (dryRun) {
        return res.json({ preview, message: '预览模式，修改未执行' });
      }

      // 3. Execute modification
      const updateFields = {};
      // Handle JSON fields
      if (field === 'name' || field === 'description') {
        try {
          const parsed = JSON.parse(oldValue || '{}');
          parsed.zh = newValue;
          updateFields[field] = JSON.stringify(parsed);
        } catch {
          updateFields[field] = JSON.stringify({ zh: newValue, en: '' });
        }
      } else if (field === 'price' || field === 'stock' || field === 'inner_diameter' || field === 'outer_diameter' || field === 'width') {
        updateFields[field] = parseFloat(newValue) || 0;
      } else {
        updateFields[field] = newValue;
      }

      const result = await bearingService.update(product.id, updateFields);
      if (result.error) {
        return res.json({ error: result.error });
      }

      // 4. Log operation
      const logId = await aiAuthService.logOperation({
        adminId: req.aiUser.id,
        adminUsername: req.aiUser.username,
        action: 'update',
        targetTable: 'bearings',
        targetId: product.id,
        beforeValue: { [field]: oldValue },
        afterValue: { [field]: updateFields[field] },
        reason: intent.reason,
        status: 'executed',
      });

      logger.info('AI修改产品成功', {
        adminId: req.aiUser.id,
        productId: product.id,
        field,
        oldValue,
        newValue: updateFields[field],
        logId,
      });

      res.json({
        message: `产品 #${product.id} 的 ${field} 已更新`,
        logId,
        before: oldValue,
        after: updateFields[field],
      });
    } catch (error) {
      logger.error('AI修改产品失败', { error: error.message });
      res.status(500).json({ error: '修改失败: ' + error.message });
    }
  });

  return router;
};
