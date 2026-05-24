export function localized(
  value: { zh: string; en: string } | string,
  lang?: string,
  fallback = 'zh'
): string {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed[lang || 'zh'] || parsed[fallback] || parsed.zh || '';
      }
    } catch {}
    return value;
  }
  if (value && typeof value === 'object') {
    return value[lang || 'zh'] || value[fallback] || value.zh || '';
  }
  return '';
}

export function getStoredLang(): string {
  if (typeof window === 'undefined') return 'zh';
  return localStorage.getItem('lang') || 'zh';
}
