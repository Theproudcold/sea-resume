const TEMPLATE_USAGE_STORAGE_KEY = 'sea-resume_template-usage';

export function getTemplateUsageMap(): Record<string, number> {
  if (typeof window === 'undefined') {
    return {};
  }

  const rawValue = window.localStorage.getItem(TEMPLATE_USAGE_STORAGE_KEY);
  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {};
    }
    return Object.entries(parsedValue).reduce<Record<string, number>>((result, [key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        result[key] = value;
      }
      return result;
    }, {});
  } catch {
    return {};
  }
}

export function markTemplateUsed(templateId: string, timestamp = Date.now()) {
  const usageMap = getTemplateUsageMap();
  usageMap[templateId] = timestamp;
  window.localStorage.setItem(TEMPLATE_USAGE_STORAGE_KEY, JSON.stringify(usageMap));
}
