import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { installElementPlus } from '../element';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

  it('imports every transitive Element Plus theme-chalk stylesheet required by registered components', () => {
    const source = readFileSync('src/plugins/element.ts', 'utf8');
    const imported = new Set(
      [...source.matchAll(/element-plus\/theme-chalk\/([^'"]+)/g)].map((match) => match[1]),
    );
    const componentNames = new Set([
      ...[...source.matchAll(/^\s*(El[A-Za-z]+),/gm)].map((match) => match[1]!),
      'ElMessage',
      'ElMessageBox',
    ]);
    const kebab = (name: string) => name.replace(/^El/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const visited = new Set<string>();
    const required = new Set<string>();

    const walk = (entryPath: string) => {
      const resolved = resolve(entryPath);
      if (visited.has(resolved) || !existsSync(resolved)) return;
      visited.add(resolved);
      const content = readFileSync(resolved, 'utf8');
      for (const match of content.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
        const spec = match[1]!;
        if (spec.startsWith('element-plus/theme-chalk/')) {
          required.add(spec.replace('element-plus/theme-chalk/', ''));
        } else if (spec.startsWith('.')) {
          walk(resolve(dirname(resolved), spec));
        }
      }
    };

    for (const name of componentNames) {
      walk(`node_modules/element-plus/es/components/${kebab(name)}/style/css.mjs`);
    }

    const missing = [...required].filter((file) => !imported.has(file)).sort();
    expect(missing).toEqual([]);
  });
});
