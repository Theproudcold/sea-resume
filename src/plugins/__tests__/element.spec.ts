import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { installElementPlus } from '../element';
import { readFileSync } from 'node:fs';

it('registers every control under its explicit public name', () => {
  const app = createApp({ template: '<div />' });
  installElementPlus(app);
  for (const name of ['ElRadioButton', 'ElRadioGroup', 'ElScrollbar', 'ElSelect', 'ElButton']) {
    expect(app.component(name), name).toBeDefined();
  }
  expect(app.component('undefined')).toBeUndefined();
});

it('renders functional edit / preview controls with the production plugin', async () => {
  const wrapper = mount(defineComponent({
    data: () => ({ mode: 'edit' }),
    template: '<el-radio-group v-model="mode" aria-label="视图"><el-radio-button value="edit">编辑</el-radio-button><el-radio-button value="preview">预览</el-radio-button></el-radio-group><output>{{ mode }}</output>',
  }), { global: { plugins: [{ install: installElementPlus }] } });
  expect(wrapper.find('el-radio-group').exists()).toBe(false);
  await wrapper.get('input[value="preview"]').setValue(true);
  await nextTick();
  expect(wrapper.get('output').text()).toBe('preview');
  wrapper.unmount();
});

describe('product theme precedence', () => {
  it('loads product overrides after the component-library styles', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main.indexOf("import './styles/main.scss'")).toBeGreaterThan(main.indexOf("from './plugins/element'"));
  });
});
