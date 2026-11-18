import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, type PropType } from 'vue';
import { ElIcon } from 'element-plus';
import type { AvatarShape, ResumeData } from '@/types/resume';
import { createDefaultResumeData } from '@/utils/resumeData';
import { templateRegistry } from '../template-registry';

// 头像外观是跨模板的共享字段，只要有模板漏接，用户的选择就会在一个成品里失效。
// 因此对注册表里的每个模板逐一验证，而不是手写六份 fixture：以后新增模板会自动进入这里。
const AVATAR = 'data:image/jpeg;base64,YXZhdGFy';

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());
beforeEach(() => setActivePinia(createPinia()));

function fixture(shape: AvatarShape | undefined): ResumeData {
  const data = createDefaultResumeData();
  data.basic.avatar = AVATAR;
  data.basic.avatarShape = shape;
  return data;
}

/** 形状可能落在图片自身，也可能落在裁切它的容器上（创意模板用底衬承载圆形）。 */
function shapeHost(image: HTMLElement): HTMLElement | null {
  if (image.style.borderRadius) return image;
  const parent = image.parentElement;
  return parent && parent.style.borderRadius ? parent : null;
}

async function renderAvatar(component: unknown, data: ResumeData) {
  const Host = defineComponent({
    props: { data: { type: Object as PropType<ResumeData>, required: true } },
    setup: (props) => () => h(component as never, { data: props.data }),
  });
  const wrapper = mount(Host, { props: { data }, global: { components: { ElIcon } } });
  await vi.waitFor(() => {
    expect(wrapper.find(`img[src="${AVATAR}"]`).exists()).toBe(true);
  });
  return wrapper.find(`img[src="${AVATAR}"]`);
}

describe.each(Object.entries(templateRegistry))('%s template avatar shape', (id, component) => {
  it('follows the stored shape and falls back to a circle for resumes without one', async () => {
    const legacy = await renderAvatar(component, fixture(undefined));
    const legacyHost = shapeHost(legacy.element as HTMLElement);
    expect(legacyHost, `${id} 模板没有把头像外观写到图片或其容器上`).not.toBeNull();
    expect(legacyHost!.style.borderRadius).toBe('999px');

    const square = await renderAvatar(component, fixture('square'));
    const squareHost = shapeHost(square.element as HTMLElement);
    expect(squareHost, `${id} 模板没有把头像外观写到图片或其容器上`).not.toBeNull();
    expect(squareHost!.style.borderRadius).toBe('2px');
  });
});
