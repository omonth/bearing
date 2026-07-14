export function localized(
  value: { zh: string; en: string } | string,
  lang?: string,
  fallback = 'zh'
): string {
  const requestedLanguage = lang || 'zh';
  const getValue = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return '';
    const fields = candidate as Record<string, unknown>;
    for (const key of [requestedLanguage, fallback, 'zh']) {
      const field = fields[key];
      if (typeof field === 'string') return field;
    }
    return '';
  };

  if (typeof value === 'string') {
    try {
      return getValue(JSON.parse(value)) || value;
    } catch {}
    return value;
  }
  return getValue(value);
}

export function getStoredLang(): string {
  if (typeof window === 'undefined') return 'zh';
  return localStorage.getItem('lang') || 'zh';
}
