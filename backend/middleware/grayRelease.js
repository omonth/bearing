const {
  loadGrayReleaseConfig,
  selectGrayReleaseVariant,
} = require('../config/grayRelease');

function getSeed(req) {
  return req.get('x-customer-id')
    || req.get('x-session-id')
    || req.get('x-forwarded-for')
    || req.ip
    || 'anonymous';
}

function createGrayReleaseMiddleware(configLoader = loadGrayReleaseConfig) {
  return (req, res, next) => {
    const config = configLoader();
    const decision = selectGrayReleaseVariant(
      config,
      getSeed(req),
      req.get(config.forceHeader)
    );

    req.grayRelease = {
      enabled: config.enabled,
      percentage: config.percentage,
      variant: config.variant,
      selectedVariant: decision.selectedVariant,
      forced: decision.forced,
    };

    res.set('X-Release-Variant', decision.selectedVariant);
    res.set('X-Release-Gray-Enabled', String(config.enabled));
    res.vary(config.forceHeader);
    res.vary('X-Customer-Id');
    res.vary('X-Session-Id');

    next();
  };
}

module.exports = {
  createGrayReleaseMiddleware,
};
