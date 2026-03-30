# Template Gallery Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready template gallery with live demo-data thumbnails, full preview dialogs, category/search/sort controls, explicit template-use flows, and recent-use sorting without polluting resume storage responsibilities.

**Architecture:** Keep template-gallery behavior in a focused `src/components/template-gallery/` slice, move shared template lookup into a single preview registry, and isolate filtering/sorting/recent-use behavior into pure TypeScript utilities so it can be tested before the view is wired. The gallery view becomes a thin orchestrator that reads template metadata from the store, demo data from a local module, and route context from editor/workbench entry points.

**Tech Stack:** Vue 3 SFCs, TypeScript, Pinia, Vue Router, Element Plus, Vitest, Vue Test Utils, jsdom

---

## Preconditions

- Current workspace is **not** a clean baseline. `pnpm build` currently fails before any template-gallery work with a syntax error in `src/views/Workbench.vue:257-264`.
- There are unrelated local modifications in several files that this feature may also touch (`src/components/common/AppHeader.vue`, `src/views/Editor.vue`, `src/types/resume.ts`, multiple template components, etc.). Do **not** revert or overwrite them. Read current diffs and integrate carefully.
- Prefer executing this plan in a dedicated worktree or isolated branch. If execution must happen in the current workspace, stop and ask the user before editing any file whose local diff is unrelated to template-gallery behavior.
- Do not commit `.superpowers/` artifacts.

## File Map

### Existing files to modify

- `package.json`
  Add test scripts and test-related devDependencies.
- `vite.config.ts`
  Register Vitest configuration alongside the existing Vite alias setup.
- `tsconfig.app.json`
  Expose Vitest globals/types to TypeScript.
- `src/types/resume.ts`
  Extend `TemplateMetadata`; keep `ResumeMeta.thumbnail` untouched but unused.
- `src/stores/template.ts`
  Enrich template metadata with labels, keywords, and recommended order.
- `src/components/preview/PreviewPanel.vue`
  Replace inline template component map with the shared registry.
- `src/views/Editor.vue`
  Replace inline template component map with the shared registry and pass resume route context into template navigation.
- `src/components/common/AppHeader.vue`
  Remove hard-coded `/templates` push in favor of a prop-driven route target used by the editor.
- `src/views/TemplateGallery.vue`
  Convert from a static card wall into the orchestration layer for filters, dialogs, recent-use persistence, and actions.

### New files to create

- `src/components/preview/template-registry.ts`
  Single source of truth for template ID -> async component resolution.
- `src/data/template-demo.ts`
  Demo resume data shared by card thumbnails and the full preview dialog.
- `src/utils/template-gallery.ts`
  Pure helpers for filtering, sorting, and title generation.
- `src/utils/template-usage.ts`
  Small localStorage wrapper for recent-use timestamps.
- `src/test/setup.ts`
  Shared test environment setup for jsdom, `ResizeObserver`, and other browser gaps.
- `src/utils/__tests__/harness.spec.ts`
  Smoke test to prove the new test harness runs.
- `src/utils/__tests__/template-gallery.spec.ts`
  Unit tests for filter/sort/title helpers.
- `src/utils/__tests__/template-usage.spec.ts`
  Unit tests for recent-use persistence helpers.
- `src/components/template-gallery/TemplateGalleryHeader.vue`
  Gallery-specific top bar so the page stops reusing the editor header.
- `src/components/template-gallery/TemplateGalleryToolbar.vue`
  Search, category, and sort controls with explicit emits.
- `src/components/template-gallery/TemplateCard.vue`
  Card shell that composes thumbnail + metadata + CTA buttons.
- `src/components/template-gallery/TemplateThumbnail.vue`
  Isolated live-preview wrapper with scaling and render-failure fallback.
- `src/components/template-gallery/TemplatePreviewDialog.vue`
  Large preview dialog with explicit CTA buttons.
- `src/components/template-gallery/UseTemplateDialog.vue`
  Action chooser dialog with `create`, `apply`, and `cancel` semantics.
- `src/components/template-gallery/__tests__/TemplateThumbnail.spec.ts`
  Component tests for thumbnail fallback and non-interactive rendering.
- `src/components/template-gallery/__tests__/TemplatePreviewDialog.spec.ts`
  Component tests for disabled/enabled CTA states.
- `src/views/__tests__/TemplateGallery.spec.ts`
  Integration tests for route-aware actions, filters, sorting, and dialog wiring.

## Task 1: Bootstrap the Test Harness

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`
- Create: `src/test/setup.ts`
- Create: `src/utils/__tests__/harness.spec.ts`

- [ ] **Step 1: Add test dependencies and scripts**

Update `package.json` with the smallest useful test surface:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Configure Vitest and browser shims**

Keep the Vite config in one place:

```ts
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
  },
});
```

Expose Vitest globals in `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "vitest/globals"]
  }
}
```

Create `src/test/setup.ts` with the minimum shims this UI needs:

```ts
import { afterEach, vi } from 'vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
}));

afterEach(() => {
  localStorage.clear();
});
```

- [ ] **Step 3: Add a smoke test for the harness**

Create `src/utils/__tests__/harness.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs in jsdom with localStorage available', () => {
    localStorage.setItem('probe', 'ok');
    expect(localStorage.getItem('probe')).toBe('ok');
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `pnpm exec vitest run src/utils/__tests__/harness.spec.ts`

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig.app.json src/test/setup.ts src/utils/__tests__/harness.spec.ts
git commit -m "test: bootstrap vitest for template gallery work"
```

## Task 2: Model Template Metadata and Pure Gallery Logic

**Files:**
- Modify: `src/types/resume.ts`
- Modify: `src/stores/template.ts`
- Create: `src/data/template-demo.ts`
- Create: `src/utils/template-gallery.ts`
- Create: `src/utils/__tests__/template-gallery.spec.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `src/utils/__tests__/template-gallery.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTemplateResumeTitle, filterTemplates, sortTemplates } from '@/utils/template-gallery';
import type { TemplateMetadata } from '@/types/resume';

const templates: TemplateMetadata[] = [
  {
    id: 'modern',
    name: '现代简约',
    description: '单栏布局',
    category: 'modern',
    categoryLabel: '现代',
    keywords: ['前端', '互联网'],
    recommendedOrder: 2,
  },
  {
    id: 'professional',
    name: '商务专业',
    description: '双栏布局',
    category: 'professional',
    categoryLabel: '商务',
    keywords: ['金融', '咨询'],
    recommendedOrder: 1,
  },
];

describe('template-gallery utils', () => {
  it('filters by category and keyword', () => {
    expect(
      filterTemplates(templates, {
        category: 'professional',
        search: '咨询',
      }).map(item => item.id),
    ).toEqual(['professional']);
  });

  it('sorts by recent usage with recommended fallback', () => {
    expect(
      sortTemplates(templates, 'recent', {
        modern: 100,
      }).map(item => item.id),
    ).toEqual(['modern', 'professional']);
  });

  it('builds a stable default title from template name and date', () => {
    expect(buildTemplateResumeTitle('现代简约', new Date('2026-03-30'))).toBe('现代简约简历 - 2026-03-30');
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `pnpm exec vitest run src/utils/__tests__/template-gallery.spec.ts`

Expected: FAIL because `src/utils/template-gallery.ts` and the new metadata fields do not exist yet.

- [ ] **Step 3: Implement the metadata and helper layer**

Extend `TemplateMetadata` in `src/types/resume.ts`:

```ts
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  category: 'modern' | 'professional' | 'creative' | 'minimal' | 'tech';
  categoryLabel: string;
  keywords: string[];
  recommendedOrder: number;
}
```

Update `src/stores/template.ts` so every template entry is complete:

```ts
{
  id: 'modern',
  name: '现代简约',
  description: '单栏布局，蓝色主题，适合互联网行业',
  category: 'modern',
  categoryLabel: '现代',
  keywords: ['前端', '互联网', '产品', '通用'],
  recommendedOrder: 1,
}
```

Create `src/utils/template-gallery.ts`:

```ts
import type { TemplateMetadata } from '@/types/resume';

export type TemplateSortKey = 'recommended' | 'name' | 'recent';
export type TemplateUsageMap = Record<string, number>;

export function filterTemplates(
  templates: TemplateMetadata[],
  filters: { category: string; search: string },
) {
  const keyword = filters.search.trim().toLowerCase();
  return templates.filter(template => {
    const categoryMatch = filters.category === 'all' || template.category === filters.category;
    const searchPool = [template.name, template.description, ...template.keywords].join(' ').toLowerCase();
    return categoryMatch && (!keyword || searchPool.includes(keyword));
  });
}

export function sortTemplates(
  templates: TemplateMetadata[],
  sortKey: TemplateSortKey,
  usage: TemplateUsageMap,
) {
  return [...templates].sort((a, b) => {
    if (sortKey === 'name') {
      return a.name.localeCompare(b.name, 'zh-CN');
    }
    if (sortKey === 'recent') {
      const recentDelta = (usage[b.id] ?? -1) - (usage[a.id] ?? -1);
      if (recentDelta !== 0) return recentDelta;
    }
    return a.recommendedOrder - b.recommendedOrder || a.name.localeCompare(b.name, 'zh-CN');
  });
}

export function buildTemplateResumeTitle(templateName: string, date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${templateName}简历 - ${yyyy}-${mm}-${dd}`;
}
```

Create `src/data/template-demo.ts` with one complete `ResumeData` object that covers:

- `basic.avatar`
- `basic.summary`
- `experiences`
- `projects`
- `education`
- `skills`
- a stable `templateId` and theme

Use realistic Chinese content so template cards do not collapse into empty states.

- [ ] **Step 4: Run the helper tests again**

Run: `pnpm exec vitest run src/utils/__tests__/template-gallery.spec.ts`

Expected: PASS with all helper tests green.

- [ ] **Step 5: Commit**

```bash
git add src/types/resume.ts src/stores/template.ts src/data/template-demo.ts src/utils/template-gallery.ts src/utils/__tests__/template-gallery.spec.ts
git commit -m "feat: add template gallery metadata and helper logic"
```

## Task 3: Centralize Template Lookup and Recent-Use Persistence

**Files:**
- Create: `src/components/preview/template-registry.ts`
- Create: `src/utils/template-usage.ts`
- Create: `src/utils/__tests__/template-usage.spec.ts`
- Modify: `src/components/preview/PreviewPanel.vue`
- Modify: `src/views/Editor.vue`

- [ ] **Step 1: Write the failing tests for recent-use persistence**

Create `src/utils/__tests__/template-usage.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markTemplateUsed, readTemplateUsage } from '@/utils/template-usage';

describe('template usage storage', () => {
  it('returns an empty object when nothing is stored', () => {
    expect(readTemplateUsage()).toEqual({});
  });

  it('writes and merges timestamps by template id', () => {
    markTemplateUsed('modern', 10);
    markTemplateUsed('professional', 20);
    expect(readTemplateUsage()).toEqual({
      modern: 10,
      professional: 20,
    });
  });
});
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `pnpm exec vitest run src/utils/__tests__/template-usage.spec.ts`

Expected: FAIL because `src/utils/template-usage.ts` does not exist yet.

- [ ] **Step 3: Implement the registry and persistence helper**

Create `src/components/preview/template-registry.ts`:

```ts
import { defineAsyncComponent } from 'vue';

export const templateRegistry = {
  modern: defineAsyncComponent(() => import('./templates/ModernTemplate.vue')),
  professional: defineAsyncComponent(() => import('./templates/ProfessionalTemplate.vue')),
  creative: defineAsyncComponent(() => import('./templates/CreativeTemplate.vue')),
  minimal: defineAsyncComponent(() => import('./templates/MinimalTemplate.vue')),
  tech: defineAsyncComponent(() => import('./templates/TechTemplate.vue')),
} as const;

export function getTemplateComponent(templateId: string) {
  return templateRegistry[templateId as keyof typeof templateRegistry] ?? null;
}
```

Create `src/utils/template-usage.ts`:

```ts
const TEMPLATE_USAGE_KEY = 'sea-resume_template-usage';

export type TemplateUsageMap = Record<string, number>;

export function readTemplateUsage(storage = window.localStorage): TemplateUsageMap {
  const raw = storage.getItem(TEMPLATE_USAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TemplateUsageMap;
  } catch {
    return {};
  }
}

export function markTemplateUsed(templateId: string, timestamp = Date.now(), storage = window.localStorage) {
  const usage = readTemplateUsage(storage);
  const nextUsage = {
    ...usage,
    [templateId]: timestamp,
  };
  storage.setItem(TEMPLATE_USAGE_KEY, JSON.stringify(nextUsage));
  return nextUsage;
}
```

Update `src/components/preview/PreviewPanel.vue` and `src/views/Editor.vue` to import `getTemplateComponent()` instead of maintaining duplicate inline maps.

- [ ] **Step 4: Run the storage tests**

Run: `pnpm exec vitest run src/utils/__tests__/template-usage.spec.ts`

Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/preview/template-registry.ts src/utils/template-usage.ts src/utils/__tests__/template-usage.spec.ts src/components/preview/PreviewPanel.vue src/views/Editor.vue
git commit -m "refactor: centralize template lookup and recent-use storage"
```

## Task 4: Build the Gallery Presentation Components

**Files:**
- Create: `src/components/template-gallery/TemplateGalleryHeader.vue`
- Create: `src/components/template-gallery/TemplateGalleryToolbar.vue`
- Create: `src/components/template-gallery/TemplateCard.vue`
- Create: `src/components/template-gallery/TemplateThumbnail.vue`
- Create: `src/components/template-gallery/TemplatePreviewDialog.vue`
- Create: `src/components/template-gallery/UseTemplateDialog.vue`
- Create: `src/components/template-gallery/__tests__/TemplateThumbnail.spec.ts`
- Create: `src/components/template-gallery/__tests__/TemplatePreviewDialog.spec.ts`

- [ ] **Step 1: Write the failing component tests**

Create `src/components/template-gallery/__tests__/TemplateThumbnail.spec.ts`:

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TemplateThumbnail from '@/components/template-gallery/TemplateThumbnail.vue';
import { demoResumeData } from '@/data/template-demo';

describe('TemplateThumbnail', () => {
  it('shows a fallback state when the template id is unknown', () => {
    const wrapper = mount(TemplateThumbnail, {
      props: {
        templateId: 'missing-template',
        data: demoResumeData,
      },
    });

    expect(wrapper.text()).toContain('预览生成失败');
  });
});
```

Create `src/components/template-gallery/__tests__/TemplatePreviewDialog.spec.ts`:

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TemplatePreviewDialog from '@/components/template-gallery/TemplatePreviewDialog.vue';
import { demoResumeData } from '@/data/template-demo';

const elementPlusStubs = {
  teleport: true,
  transition: false,
  'el-dialog': {
    template: '<div><slot /><slot name="footer" /></div>',
  },
  'el-button': {
    props: ['disabled'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
};

describe('TemplatePreviewDialog', () => {
  it('disables apply-to-current when no resumeId is available', () => {
    const wrapper = mount(TemplatePreviewDialog, {
      props: {
        modelValue: true,
        template: {
          id: 'modern',
          name: '现代简约',
          description: 'desc',
          category: 'modern',
          categoryLabel: '现代',
          keywords: [],
          recommendedOrder: 1,
        },
        previewData: demoResumeData,
        resumeId: '',
      },
      global: {
        stubs: elementPlusStubs,
      },
    });

    expect(wrapper.find('[data-testid=\"apply-current-button\"]').attributes('disabled')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `pnpm exec vitest run src/components/template-gallery/__tests__/TemplateThumbnail.spec.ts src/components/template-gallery/__tests__/TemplatePreviewDialog.spec.ts`

Expected: FAIL because the gallery components do not exist yet.

- [ ] **Step 3: Implement the gallery components**

Create `TemplateThumbnail.vue` with:

- `templateId` and `data` props
- `pointer-events: none` on the preview surface
- shared `getTemplateComponent(templateId)` lookup
- an `onErrorCaptured` fallback to a simple placeholder state
- a fixed A4 aspect-ratio shell for card and dialog reuse

Core shape:

```vue
<script setup lang="ts">
import { computed, onErrorCaptured, ref } from 'vue';
import { getTemplateComponent } from '@/components/preview/template-registry';

const props = defineProps<{
  templateId: string;
  data: ResumeData;
  scale?: number;
}>();

const hasError = ref(false);
const component = computed(() => getTemplateComponent(props.templateId));

onErrorCaptured(() => {
  hasError.value = true;
  return false;
});
</script>
```

Create `TemplatePreviewDialog.vue` and `UseTemplateDialog.vue` with explicit emits:

```ts
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  create: [templateId: string];
  apply: [templateId: string];
}>();
```

Use `data-testid="apply-current-button"` for the disabled-state test.

Create `TemplateGalleryHeader.vue` and `TemplateGalleryToolbar.vue` so `src/views/TemplateGallery.vue` stays orchestration-only.

- [ ] **Step 4: Run the component tests again**

Run: `pnpm exec vitest run src/components/template-gallery/__tests__/TemplateThumbnail.spec.ts src/components/template-gallery/__tests__/TemplatePreviewDialog.spec.ts`

Expected: PASS with the fallback and disabled-state assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/components/template-gallery/TemplateGalleryHeader.vue src/components/template-gallery/TemplateGalleryToolbar.vue src/components/template-gallery/TemplateCard.vue src/components/template-gallery/TemplateThumbnail.vue src/components/template-gallery/TemplatePreviewDialog.vue src/components/template-gallery/UseTemplateDialog.vue src/components/template-gallery/__tests__/TemplateThumbnail.spec.ts src/components/template-gallery/__tests__/TemplatePreviewDialog.spec.ts
git commit -m "feat: add template gallery presentation components"
```

## Task 5: Wire the Gallery View, Route Context, and CTA Flows

**Files:**
- Modify: `src/components/common/AppHeader.vue`
- Modify: `src/views/Editor.vue`
- Modify: `src/views/TemplateGallery.vue`
- Create: `src/views/__tests__/TemplateGallery.spec.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `src/views/__tests__/TemplateGallery.spec.ts` with three key scenarios:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TemplateGallery from '@/views/TemplateGallery.vue';
import { useResumeStore } from '@/stores/resume';
import { useWorkbenchStore } from '@/stores/workbench';

const mockRoute = vi.hoisted(() => ({ query: {} as Record<string, string> }));
const mockRouter = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter,
}));

const galleryStubs = {
  teleport: true,
  TemplateGalleryToolbar: {
    template: `
      <div>
        <button data-testid="search-tech" @click="$emit('update:search', '科技')">search</button>
        <button data-testid="sort-recent" @click="$emit('update:sort', 'recent')">sort</button>
      </div>
    `,
  },
  TemplateCard: {
    props: ['template'],
    template: `
      <div :data-testid="'template-card-' + template.id">
        <button :data-testid="'preview-button-' + template.id" @click="$emit('preview', template)">preview</button>
        <button :data-testid="'use-button-' + template.id" @click="$emit('use', template)">use</button>
      </div>
    `,
  },
  TemplatePreviewDialog: {
    props: ['modelValue', 'template', 'resumeId'],
    template: `
      <div v-if="modelValue">
        <button
          data-testid="apply-current-button"
          :disabled="!resumeId"
          @click="$emit('apply', template.id)"
        >
          apply
        </button>
      </div>
    `,
  },
  UseTemplateDialog: {
    props: ['modelValue', 'template'],
    template: `
      <div v-if="modelValue">
        <button data-testid="confirm-apply-current" @click="$emit('apply', template.id)">apply current</button>
      </div>
    `,
  },
};

describe('TemplateGallery view', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockRoute.query = {};
    mockRouter.push.mockReset();
  });

  it('disables apply-to-current actions when opened without a resumeId query', async () => {
    const wrapper = mount(TemplateGallery, {
      global: {
        stubs: galleryStubs,
      },
    });

    await wrapper.find('[data-testid=\"preview-button-modern\"]').trigger('click');
    expect(wrapper.find('[data-testid=\"apply-current-button\"]').attributes('disabled')).toBeDefined();
  });

  it('filters by keyword and respects recent sorting', async () => {
    localStorage.setItem('sea-resume_template-usage', JSON.stringify({ tech: 100 }));
    const wrapper = mount(TemplateGallery, {
      global: {
        stubs: galleryStubs,
      },
    });

    await wrapper.find('[data-testid=\"search-tech\"]').trigger('click');
    await wrapper.find('[data-testid=\"sort-recent\"]').trigger('click');
    expect(wrapper.findAll('[data-testid^=\"template-card-\"]')[0].attributes('data-testid')).toContain('tech');
  });

  it('loads the target resume before applying a template to the current editor flow', async () => {
    mockRoute.query = { resumeId: 'resume-1' };
    const resumeStore = useResumeStore();
    const workbenchStore = useWorkbenchStore();
    vi.spyOn(resumeStore, 'loadResume').mockResolvedValue();
    vi.spyOn(resumeStore, 'setTemplate').mockImplementation(() => {});
    vi.spyOn(workbenchStore, 'createResume').mockResolvedValue('unused-new-id');

    const wrapper = mount(TemplateGallery, {
      global: {
        stubs: galleryStubs,
      },
    });

    await wrapper.find('[data-testid=\"use-button-modern\"]').trigger('click');
    await wrapper.find('[data-testid=\"confirm-apply-current\"]').trigger('click');
    expect(resumeStore.loadResume).toHaveBeenCalledWith('resume-1');
    expect(resumeStore.setTemplate).toHaveBeenCalledWith('modern');
    expect(mockRouter.push).toHaveBeenCalledWith('/editor/resume-1');
  });
});
```

- [ ] **Step 2: Run the integration tests to verify they fail**

Run: `pnpm exec vitest run src/views/__tests__/TemplateGallery.spec.ts`

Expected: FAIL because the view still uses the old placeholder layout and hard-coded action flow.

- [ ] **Step 3: Implement the route-aware wiring**

Update `src/components/common/AppHeader.vue` so the template button uses a prop instead of a hard-coded push:

```vue
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps<{
  templateTo?: RouteLocationRaw;
}>();

const router = useRouter();
const templateTo = computed<RouteLocationRaw>(() => props.templateTo ?? '/templates');
const goToTemplates = () => {
  router.push(templateTo.value);
};
</script>
```

Update `src/views/Editor.vue` to pass the current resume context:

```vue
<AppHeader
  :template-to="{ path: '/templates', query: { resumeId: String(route.params.id) } }"
  @command="handleCommand"
  @back="handleBack"
  @fullscreen="showFullscreen = true"
/>
```

Refactor `src/views/TemplateGallery.vue` so it:

- uses `TemplateGalleryHeader`, `TemplateGalleryToolbar`, and `TemplateCard`
- reads `resumeId` from `useRoute().query.resumeId`
- reads usage timestamps with `readTemplateUsage()`
- filters/sorts through `filterTemplates()` + `sortTemplates()`
- opens `TemplatePreviewDialog` and `UseTemplateDialog`
- creates a new resume with `buildTemplateResumeTitle(template.name)`
- on apply-to-current:
  - `await resumeStore.loadResume(resumeId)` if `resumeStore.data.id !== resumeId`
  - `resumeStore.setTemplate(templateId)`
  - `markTemplateUsed(templateId)`
  - `router.push(\`/editor/${resumeId}\`)`
- on create-new:
  - `const id = await workbenchStore.createResume(buildTemplateResumeTitle(template.name), templateId)`
  - `markTemplateUsed(templateId)`
  - `router.push(\`/editor/${id}\`)`

Expose stable test hooks:

- `data-testid="search-input"`
- `data-testid="sort-select"`
- `data-testid="preview-button-<id>"`
- `data-testid="use-button-<id>"`
- `data-testid="template-card-<id>"`
- `data-testid="confirm-apply-current"`

- [ ] **Step 4: Run the integration tests again**

Run: `pnpm exec vitest run src/views/__tests__/TemplateGallery.spec.ts`

Expected: PASS with route-aware CTA behavior, filtering, and sorting verified.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/AppHeader.vue src/views/Editor.vue src/views/TemplateGallery.vue src/views/__tests__/TemplateGallery.spec.ts
git commit -m "feat: wire route-aware template gallery flows"
```

## Task 6: Final Verification and Safe Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-03-30-template-gallery-implementation.md` (checkboxes only)

- [ ] **Step 1: Run the focused automated test suite**

Run:

```bash
pnpm exec vitest run \
  src/utils/__tests__/harness.spec.ts \
  src/utils/__tests__/template-gallery.spec.ts \
  src/utils/__tests__/template-usage.spec.ts \
  src/components/template-gallery/__tests__/TemplateThumbnail.spec.ts \
  src/components/template-gallery/__tests__/TemplatePreviewDialog.spec.ts \
  src/views/__tests__/TemplateGallery.spec.ts
```

Expected: PASS across all template-gallery suites.

- [ ] **Step 2: Run the build and handle the known baseline blocker correctly**

Run: `pnpm build`

Expected:

- If `src/views/Workbench.vue:257-264` is still broken before feature work, the build will fail in the **same unrelated location**. Stop and report that the pre-existing blocker remains.
- If the baseline blocker has been resolved separately, expect a clean build.

Do **not** patch unrelated `Workbench.vue` syntax unless the user explicitly asks for it.

- [ ] **Step 3: Run manual regression checks**

Verify all of the following in the browser:

- from workbench -> open `/templates` -> search/filter/sort -> create new resume from a template
- from editor -> open `/templates?resumeId=<id>` -> preview -> apply to current resume
- preview dialog close/open transitions
- recent-use sorting changes **only** after successful create/apply
- mobile layout wraps the toolbar and stacks cards into one column
- thumbnail failure fallback appears if a bad template id is forced in dev

- [ ] **Step 4: Commit the finished feature work**

```bash
git add package.json vite.config.ts tsconfig.app.json src/types/resume.ts src/stores/template.ts src/components/preview/template-registry.ts src/components/preview/PreviewPanel.vue src/components/common/AppHeader.vue src/views/Editor.vue src/views/TemplateGallery.vue src/data/template-demo.ts src/utils/template-gallery.ts src/utils/template-usage.ts src/test/setup.ts src/utils/__tests__/harness.spec.ts src/utils/__tests__/template-gallery.spec.ts src/utils/__tests__/template-usage.spec.ts src/components/template-gallery src/views/__tests__/TemplateGallery.spec.ts
git commit -m "feat: enhance template gallery preview and selection flow"
```

- [ ] **Step 5: Handoff notes**

Report these facts explicitly in the final implementation handoff:

- whether `pnpm build` passed cleanly or remained blocked by the pre-existing `Workbench.vue` syntax error
- which route entry points were verified (`/templates`, `/templates?resumeId=<id>`)
- whether any target files contained pre-existing local changes that were preserved during implementation
