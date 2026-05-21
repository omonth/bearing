const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const path = require('path');

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    // 默认语言
    fallbackLng: 'zh',
    // 支持的语言
    supportedLngs: ['zh', 'en'],
    // 预加载语言
    preload: ['zh', 'en'],
    // 命名空间
    ns: ['common', 'errors', 'emails'],
    defaultNS: 'common',
    // 后端配置
    backend: {
      loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json')
    },
    // 检测选项
    detection: {
      order: ['querystring', 'cookie', 'header'],
      caches: ['cookie'],
      lookupQuerystring: 'lang',
      lookupCookie: 'i18next',
      lookupHeader: 'accept-language'
    },
    // 插值选项
    interpolation: {
      escapeValue: false
    }
  });

module.exports = {
  i18next,
  middleware
};
