import { beforeEach, describe, expect, it } from 'vitest';
import { getTemplateUsageMap, markTemplateUsed } from '@/utils/template-usage';

describe('template-usage utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty usage map by default', () => {
    expect(getTemplateUsageMap()).toEqual({});
  });

  it('stores template usage timestamps', () => {
    markTemplateUsed('modern', 123);
    expect(getTemplateUsageMap()).toEqual({
      modern: 123,
    });
  });
});
