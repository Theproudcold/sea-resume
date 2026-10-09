import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { createPrivacyMaskedResume, maskSensitiveText } from '@/utils/privacyMask';

describe('privacy preview masking', () => {
  it('creates a redacted presentation copy without mutating saved resume data', () => {
    const original = parseResumeMarkdown(`---\nname: 林晓\nemail: xiaolin@example.com\nphone: 13800138000\nwebsite: https://example.com/me\nbirthdate: 1990-08-12\n---\n# 林晓\n\n## 个人简介\n联系 xiaolin@example.com 或 13800138000\n\n## 工作经历\n### Acme | Engineer | 2022-2025\n- 联系邮箱 xiaolin@example.com`).resume;
    original.basic.showAge = true;
    original.basic.showExperienceYears = true;
    const masked = createPrivacyMaskedResume(original);
    expect(masked.basic.name).toBe('匿名用户');
    expect(masked.basic.email).toBe('***@***.***');
    expect(masked.basic.phone).toBe('***-****-****');
    expect(masked.basic.website).toBe('');
    expect(masked.basic.birthDate).toBeUndefined();
    expect(masked.basic.showAge).toBe(false);
    expect(masked.basic.showExperienceYears).toBe(false);
    expect(masked.basic.summary).not.toContain('xiaolin@example.com');
    expect(masked.experiences[0]?.description).not.toContain('xiaolin@example.com');
    expect(masked.experiences[0]?.startDate).toBe('2022');
    expect(original.basic.name).toBe('林晓');
    expect(original.basic.email).toBe('xiaolin@example.com');
    expect(original.basic.website).toBe('https://example.com/me');
    expect(original.basic.birthDate).toBe('1990-08-12');
  });

  it('masks common emails and phone numbers without changing date ranges', () => {
    expect(maskSensitiveText('2022-2025 · 138-0013-8000 · name@example.com')).toBe('2022-2025 · [电话已隐藏] · [邮箱已隐藏]');
  });
});
