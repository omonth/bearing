const VERSION = '202607180002';

const CUSTOMER_LEVELS = [
  ['bronze', '青铜会员', 0, 0, '基础服务', '#CD7F32'],
  ['silver', '白银会员', 1000, 5, '5%折扣,优先发货', '#C0C0C0'],
  ['gold', '黄金会员', 5000, 10, '10%折扣,专属客服', '#FFD700'],
  ['platinum', '铂金会员', 10000, 15, '15%折扣,免运费', '#E5E4E2'],
  ['diamond', '钻石会员', 50000, 20, '20%折扣,定制服务', '#B9F2FF'],
];

const CUSTOMER_TAGS = [
  ['VIP', '#FF0000', '重要客户'],
  ['新客户', '#00FF00', '新注册客户'],
  ['活跃', '#0000FF', '经常购买'],
  ['沉睡', '#808080', '长期未购买'],
  ['高价值', '#FFD700', '消费金额高'],
];

module.exports = {
  version: VERSION,
  name: 'default_crm_reference_data',
  irreversible: true,
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.24+; uses ON CONFLICT DO NOTHING',
      postgresql: 'PostgreSQL 12+; uses ON CONFLICT DO NOTHING',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Only inserts missing reference rows with ON CONFLICT DO NOTHING. It changes no schema and does not overwrite rows read or written by the immediately previous release.',
    },
    dataImpact: 'Adds missing built-in CRM levels and tags by stable unique keys. Existing rows, including administrator customizations, are not overwritten or deleted.',
    recoveryPlan: 'Do not delete adopted reference rows automatically. Correct or retire reference data with a reviewed forward data migration, or restore the verified pre-migration backup.',
  },
  async up({ db }) {
    for (const level of CUSTOMER_LEVELS) {
      await db.run(
        `INSERT INTO customer_levels
          (level, name, min_points, discount_rate, benefits, color)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(level) DO NOTHING`,
        level
      );
    }
    for (const tag of CUSTOMER_TAGS) {
      await db.run(
        `INSERT INTO customer_tags (name, color, description)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO NOTHING`,
        tag
      );
    }
  },
};
