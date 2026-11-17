import { defineComponent, computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useSectionKeepAlive } from '@/composables/useSectionKeepAlive';

const FakeHost = defineComponent({ name: 'FakeHost', setup: () => () => null });

function setup(initialResume = 'r1', initialSection = 'basic') {
  const resumeId = ref(initialResume);
  const sectionId = ref(initialSection);
  const order = ref(['experience', 'projects']);
  const validSectionIds = computed(() => ['theme', 'basic', ...order.value]);
  const api = useSectionKeepAlive({
    hostComponent: FakeHost,
    resumeId,
    sectionId,
    validSectionIds,
  });
  return { resumeId, sectionId, order, api };
}

describe('useSectionKeepAlive', () => {
  it('reuses one host per section instead of rebuilding it', () => {
    const { sectionId, api } = setup();
    const first = api.host.value;
    sectionId.value = 'experience';
    const second = api.host.value;
    sectionId.value = 'basic';
    expect(api.host.value).toBe(first);
    expect(second).not.toBe(first);
  });

  it('scopes hosts to the resume so switching resumes remounts', () => {
    const { resumeId, api } = setup();
    const before = api.host.value;
    resumeId.value = 'r2';
    expect(api.host.value).not.toBe(before);
  });

  it('never puts a comma in a host name', () => {
    // KeepAlive 按逗号切分 include 模式；分区 ID 由用户命名，可能带逗号。
    const { sectionId, api } = setup('r1', 'my, custom');
    expect(api.cacheableHostNames.value.some((name) => name.includes(','))).toBe(false);
    expect(api.host.value).toBeTruthy();
  });

  it('drops hosts for sections that leave the order', () => {
    const { order, sectionId, api } = setup('r1', 'projects');
    const before = api.host.value;
    order.value = ['experience'];
    expect(api.cacheableHostNames.value.some((name) => name.endsWith(encodeURIComponent(JSON.stringify(['r1', 'projects']))))).toBe(false);
    // 回到了一个仍在顺序里的分区，且拿到的是新宿主。
    sectionId.value = 'experience';
    expect(api.host.value).not.toBe(before);
  });
});
