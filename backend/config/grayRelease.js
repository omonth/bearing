const DEFAULT_VARIANT = 'canary';
const DEFAULT_FORCE_HEADER = 'x-gray-release';

function parseEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function parsePercentage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

function normalizeHeaderName(value) {
  const headerName = String(value || DEFAULT_FORCE_HEADER).trim().toLowerCase();
  return /^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(headerName) ? headerName : DEFAULT_FORCE_HEADER;
}

function loadGrayReleaseConfig(env = process.env) {
  const variant = String(env.GRAY_RELEASE_VARIANT || DEFAULT_VARIANT).trim() || DEFAULT_VARIANT;

  return {
    enabled: parseEnabled(env.GRAY_RELEASE_ENABLED),
    percentage: parsePercentage(env.GRAY_RELEASE_PERCENTAGE),
    variant,
    forceHeader: normalizeHeaderName(env.GRAY_RELEASE_FORCE_HEADER),
  };
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed || 'anonymous')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectGrayReleaseVariant(config, seed, forcedVariant) {
  const stable = {
    selectedVariant: 'stable',
    forced: false,
  };

  if (!config.enabled) {
    return stable;
  }

  const normalizedForcedVariant = String(forcedVariant || '').trim();
  if (normalizedForcedVariant === 'stable') {
    return stable;
  }
  if (normalizedForcedVariant && normalizedForcedVariant === config.variant) {
    return {
      selectedVariant: config.variant,
      forced: true,
    };
  }

  if (config.percentage <= 0) {
    return stable;
  }

  if (config.percentage >= 100) {
    return {
      selectedVariant: config.variant,
      forced: false,
    };
  }

  const bucket = hashSeed(seed) % 100;
  if (bucket < config.percentage) {
    return {
      selectedVariant: config.variant,
      forced: false,
    };
  }

  return stable;
}

module.exports = {
  loadGrayReleaseConfig,
  selectGrayReleaseVariant,
};
