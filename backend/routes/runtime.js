const express = require('express');
const { loadGrayReleaseConfig, selectGrayReleaseVariant } = require('../config/grayRelease');

const router = express.Router();

router.get('/gray', (req, res) => {
  if (req.grayRelease) {
    res.json(req.grayRelease);
    return;
  }

  const config = loadGrayReleaseConfig();
  const decision = selectGrayReleaseVariant(config, req.ip, req.get(config.forceHeader));
  res.json({
    enabled: config.enabled,
    percentage: config.percentage,
    variant: config.variant,
    selectedVariant: decision.selectedVariant,
    forced: decision.forced,
  });
});

module.exports = router;
