<template>
  <el-dialog
    :model-value="modelValue"
    title="设置"
    width="var(--ui-dialog-width-lg)"
    align-center
    class="app-settings-dialog settings-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="settings-layout">
      <nav class="settings-sidebar" aria-label="设置分类">
        <button
          v-for="entry in sections"
          :key="entry.id"
          type="button"
          class="settings-nav-item"
          :class="{ 'is-active': section === entry.id }"
          :aria-current="section === entry.id ? 'page' : undefined"
          @click="section = entry.id"
        >
          <strong>{{ entry.title }}</strong><span>{{ entry.hint }}</span>
        </button>
      </nav>

      <main class="settings-main">
        <section v-if="section === 'ai'" class="settings-page">
          <header class="settings-page-heading">
            <h2>AI 服务</h2>
            <p>支持通过外部 Agent（MCP，免 API Key）或网页模型 API 驱动，不影响手动编辑简历。</p>
          </header>
          <AiProviderSettingsPanel />
        </section>

        <section v-else-if="section === 'storage'" class="settings-page">
          <header class="settings-page-heading">
            <h2>存储位置</h2>
            <p>选择简历保存在当前浏览器，或你授权的本地目录。</p>
          </header>
          <section class="settings-section">
            <p class="storage-status">
              当前存储：<strong>{{ storageStore.storageTypeName }}</strong><span v-if="storageStore.currentType === 'file_system' && storageStore.config?.fileSystem?.directoryPath">（{{ storageStore.config.fileSystem.directoryPath }}）</span>
            </p>
            <el-alert v-if="storageStore.initializationWarning" class="settings-alert" type="warning" :closable="false" :title="storageStore.initializationWarning" />
            <el-alert v-if="storageStore.currentType === 'local_storage'" class="settings-alert" type="warning" :closable="false" show-icon title="简历保存在当前浏览器缓存。清理浏览器数据可能导致丢失，请定期导出备份。" />
            <p v-else class="settings-help">简历保存在你授权的本地目录；浏览器可能在后续访问时要求重新授权。</p>
            <div class="settings-actions">
              <el-button type="primary" :loading="storageStore.isMigrating" @click="emit('choose-directory')">{{ storageStore.currentType === 'file_system' ? '更换本地文件夹' : '保存到本地文件夹' }}</el-button>
              <el-button
                v-if="storageStore.hasFileSystemConfig && storageStore.currentType !== 'file_system'"
                type="primary"
                plain
                :loading="storageStore.isMigrating"
                @click="emit('reauthorize-directory')"
              >重新授权本地目录</el-button>
              <el-button v-if="storageStore.currentType === 'file_system'" :loading="storageStore.isMigrating" @click="emit('switch-to-browser')">改存到浏览器</el-button>
            </div>
            <p class="settings-help">空目录会复制当前简历；已有简历时仅补入缺失项，同 ID 冲突保留目录版本。旧目录升级时保留原文件。</p>
            <details class="settings-help storage-more"><summary>如何通过网盘同步？</summary><p>选择网盘客户端的同步文件夹，由客户端负责上传；本站不保存网盘账号。同步有延迟，请等一台设备同步完成后再换设备编辑。</p></details>
          </section>
        </section>

        <section v-else-if="section === 'backup'" class="settings-page">
          <header class="settings-page-heading">
            <h2>备份与恢复</h2>
            <p>备份用于迁移或恢复；导入会创建副本，不会覆盖已有简历。</p>
          </header>
          <section class="settings-section">
            <h3>单份简历备份</h3>
            <p v-if="!resumes.length" class="settings-help">还没有简历可导出，可以导入之前保存的备份。</p>
            <div class="settings-actions backup-actions">
              <el-select v-model="backupResumeId" placeholder="选择简历" aria-label="要备份的简历" :disabled="!resumes.length" class="backup-select">
                <el-option v-for="resume in resumes" :key="resume.id" :label="resume.title" :value="resume.id" />
              </el-select>
              <el-button type="primary" :disabled="!backupResumeId" @click="emit('export-backup', backupResumeId)">导出 JSON 备份</el-button>
              <el-button @click="emit('import-backup')">导入备份</el-button>
            </div>
          </section>
          <section class="ui-danger-zone">
            <h3 class="ui-danger-zone__title">清空所有简历</h3>
            <p class="ui-danger-zone__description">删除当前存储位置中的全部简历，且无法撤销。</p>
            <el-button type="danger" plain :disabled="!resumes.length" @click="emit('reset-all')">
              <el-icon class="mr-1"><Delete /></el-icon>
              清空全部简历
            </el-button>
          </section>
        </section>

        <section v-else class="settings-page">
          <header class="settings-page-heading">
            <h2>关于 Sea Resume</h2>
            <p>简洁、灵活的简历制作工具。</p>
          </header>
          <div class="about-card"><strong>Sea Resume</strong><span>版本 {{ appVersion }}</span></div>
        </section>
      </main>
    </div>
    <template #footer>
      <div class="app-dialog-actions">
        <el-button type="primary" @click="emit('update:modelValue', false)">完成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Delete } from '@element-plus/icons-vue';
import type { ResumeMeta } from '@/types/resume';
import { useStorageStore } from '@/stores/storage';
import { lazyFeature } from '@/utils/lazyFeature';

const AiProviderSettingsPanel = lazyFeature(() => import('@/components/workbench/AiProviderSettingsPanel.vue'));

export type SettingsSection = 'ai' | 'storage' | 'backup' | 'about';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  resumes: ResumeMeta[];
  /** 从外部打开时直接定位到某个分区（例如 `?aiSettings=1`）。 */
  initialSection?: SettingsSection;
}>(), { initialSection: 'ai' });

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'choose-directory': [];
  'reauthorize-directory': [];
  'switch-to-browser': [];
  'export-backup': [resumeId: string];
  'import-backup': [];
  'reset-all': [];
}>();

const storageStore = useStorageStore();
// 构建时由 vite 从 package.json 注入；测试环境下用占位值。
const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '开发版';
const section = ref<SettingsSection>(props.initialSection);
const backupResumeId = ref('');

const sections: Array<{ id: SettingsSection; title: string; hint: string }> = [
  { id: 'ai', title: 'AI 模型', hint: '服务商与 API Key' },
  { id: 'storage', title: '存储位置', hint: '浏览器或本地目录' },
  { id: 'backup', title: '备份与恢复', hint: '单份简历与数据管理' },
  { id: 'about', title: '关于', hint: 'Sea Resume' },
];

// 每次打开都按调用方指定的分区进入，并保证选中的简历仍然存在。
watch(() => props.modelValue, (open) => {
  if (!open) return;
  section.value = props.initialSection;
});

watch([() => props.resumes, () => props.modelValue], ([list, open]) => {
  if (!open) return;
  if (!list.some((resume) => resume.id === backupResumeId.value)) {
    backupResumeId.value = list[0]?.id || '';
  }
}, { immediate: true });
</script>

<style scoped>
/* Settings: a rail of square cells beside the page. */
.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--space-lg);
  min-height: 400px;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  border-right: var(--rule-bar) solid var(--color-rule);
}

.settings-nav-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  min-height: 44px;
  padding: var(--space-sm) var(--space-md);
  border: 0;
  border-bottom: var(--rule-hair) solid var(--color-rule);
  background: transparent;
  color: var(--color-ink);
  text-align: left;
  border-radius: var(--radius-input);
  cursor: pointer;
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out);
}

.settings-nav-item strong {
  font-size: var(--text-sm);
  font-weight: 600;
}

.settings-nav-item span {
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.settings-nav-item:hover {
  background: var(--color-paper-2);
}

.settings-nav-item:active,
.settings-nav-item.is-active {
  background: var(--color-accent-wash);
  color: var(--color-accent);
}

.settings-nav-item:active span,
.settings-nav-item.is-active span {
  color: var(--color-accent);
}

.settings-nav-item:focus-visible {
  outline-offset: -2px;
}

.settings-main {
  min-width: 0;
  max-height: min(68vh, 680px);
  overflow-y: auto;
  padding: 0 var(--space-2xs) var(--space-2xs) 0;
}

.settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.settings-page-heading h2 {
  margin: 0;
  color: var(--color-ink);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: 1.2;
}

.settings-page-heading p {
  max-width: 62ch;
  margin: var(--space-xs) 0 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: var(--ui-line-height);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md) 0 0;
  border-top: var(--rule-bar) solid var(--color-rule);
}

.settings-section h3 {
  margin: 0;
  color: var(--color-ink);
  font-size: var(--text-md);
  font-weight: 600;
}

.storage-status {
  margin: 0;
  color: var(--color-ink-2);
  overflow-wrap: anywhere;
}

.storage-status strong {
  color: var(--color-ink);
  font-weight: 600;
}

.settings-help {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
  line-height: var(--ui-line-height);
}

.storage-more summary { cursor: pointer; color: var(--color-ink-2); }
.storage-more p { margin-bottom: 0; }

.settings-alert {
  margin: 0;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
}

.settings-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.backup-select {
  flex: 1 1 220px;
  min-width: min(220px, 100%);
  max-width: 100%;
}

.about-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--space-md);
  padding: var(--space-md) 0;
  border-top: var(--rule-bar) solid var(--color-rule);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.about-card strong {
  font-size: var(--text-lg);
  font-weight: 600;
}

.about-card span {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .settings-layout {
    grid-template-columns: 1fr;
    gap: var(--space-md);
  }

  .settings-sidebar {
    flex-direction: row;
    overflow-x: auto;
    border-right: 0;
    border-bottom: var(--rule-bar) solid var(--color-rule);
  }

  .settings-nav-item {
    flex: 1 1 0;
    min-width: 0;
    padding: var(--space-sm) var(--space-2xs);
    text-align: center;
    border-bottom: 0;
    border-right: var(--rule-hair) solid var(--color-rule);
  }

  .settings-nav-item span { display: none; }
  .settings-nav-item strong { font-size: var(--text-xs); }

  .settings-main {
    max-height: min(64vh, 600px);
    padding-right: 0;
  }

  .settings-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .settings-actions :deep(.el-button),
  .backup-select {
    width: 100%;
    flex-basis: auto;
  }
}

@media (max-width: 420px) {
  .settings-nav-item span {
    display: none;
  }

  .settings-nav-item {
    min-width: 0;
  }
}
</style>
