<template>
  <div class="basic-info-editor space-y-4">
    <el-form label-position="top">
      <el-form-item label="照片（选填）">
        <div class="avatar-field">
          <el-upload
            class="avatar-uploader"
            aria-label="上传或更换照片"
            :show-file-list="false"
            :auto-upload="false"
            :on-change="handleAvatarChange"
            accept="image/*"
          >
            <div v-if="localBasic.avatar" class="avatar-frame" :style="{ borderRadius: avatarBorderRadius(localBasic.avatarShape) }">
              <img :src="localBasic.avatar" class="avatar-image" alt="" />
              <div class="avatar-overlay">
                <el-icon><Edit /></el-icon>
              </div>
            </div>
            <div v-else class="avatar-empty" :style="{ borderRadius: avatarBorderRadius(localBasic.avatarShape) }">
              <el-icon><Plus /></el-icon>
            </div>
          </el-upload>
          <div v-if="localBasic.avatar" class="avatar-shape">
            <el-radio-group
              :model-value="normalizeAvatarShape(localBasic.avatarShape)"
              size="small"
              aria-label="头像外观"
              @update:model-value="(shape: unknown) => handleUpdate({ avatarShape: normalizeAvatarShape(shape) })"
            >
              <el-radio-button v-for="option in AVATAR_SHAPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="姓名" required data-quality-id="basic-name">
        <el-input
          :model-value="localBasic.name"
          placeholder="请输入姓名"
          autocomplete="name"
          @update:model-value="(name: string) => handleUpdate({ name })"
        />
      </el-form-item>

      <el-form-item label="求职意向" required data-quality-id="basic-title">
        <el-input
          :model-value="localBasic.title"
          placeholder="例如：前端工程师"
          @update:model-value="(title: string) => handleUpdate({ title })"
        />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="邮箱" required class="relative" data-quality-id="basic-contact">
            <template #label>
              <div class="flex items-center gap-2">
                <span>邮箱</span>
                <el-popover placement="bottom" :width="200" trigger="click">
                  <template #reference>
                    <el-button link size="small" aria-label="更换邮箱图标" title="更换图标" :icon="Icons[(localBasic.iconOverrides?.email || 'Message') as keyof typeof Icons]">
                    </el-button>
                  </template>
                  <div class="grid grid-cols-4 gap-2">
                    <button
                      v-for="icon in iconOptions.email"
                      :key="icon"
                      type="button"
                      class="icon-option-button"
                      :class="{ 'is-active': localBasic.iconOverrides?.email === icon }"
                      :aria-label="`邮箱图标 ${icon}`"
                      :aria-pressed="localBasic.iconOverrides?.email === icon"
                      @click="updateIcon('email', icon)"
                    >
                      <el-icon><component :is="Icons[icon as keyof typeof Icons]" /></el-icon>
                    </button>
                  </div>
                </el-popover>
              </div>
            </template>
            <el-input
              :model-value="localBasic.email"
              placeholder="your@email.com"
              type="email"
              autocomplete="email"
              @update:model-value="(email: string) => handleUpdate({ email })"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="电话" required>
            <template #label>
              <div class="flex items-center gap-2">
                <span>电话</span>
                <el-popover placement="bottom" :width="200" trigger="click">
                  <template #reference>
                    <el-button link size="small" aria-label="更换电话图标" title="更换图标" :icon="Icons[(localBasic.iconOverrides?.phone || 'Iphone') as keyof typeof Icons]">
                    </el-button>
                  </template>
                  <div class="grid grid-cols-4 gap-2">
                    <button
                      v-for="icon in iconOptions.phone"
                      :key="icon"
                      type="button"
                      class="icon-option-button"
                      :class="{ 'is-active': localBasic.iconOverrides?.phone === icon }"
                      :aria-label="`电话图标 ${icon}`"
                      :aria-pressed="localBasic.iconOverrides?.phone === icon"
                      @click="updateIcon('phone', icon)"
                    >
                      <el-icon><component :is="Icons[icon as keyof typeof Icons]" /></el-icon>
                    </button>
                  </div>
                </el-popover>
              </div>
            </template>
            <el-input
              :model-value="localBasic.phone"
              placeholder="手机号码"
              type="tel"
              autocomplete="tel"
              @update:model-value="(phone: string) => handleUpdate({ phone })"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="所在城市">
        <template #label>
          <div class="flex items-center gap-2">
            <span>所在城市</span>
             <el-popover placement="bottom" :width="200" trigger="click">
              <template #reference>
                <el-button link size="small" aria-label="更换所在城市图标" title="更换图标" :icon="Icons[(localBasic.iconOverrides?.location || 'Location') as keyof typeof Icons]">
                </el-button>
              </template>
              <div class="grid grid-cols-4 gap-2">
                <button
                  v-for="icon in iconOptions.location"
                  :key="icon"
                  type="button"
                  class="icon-option-button"
                  :class="{ 'is-active': localBasic.iconOverrides?.location === icon }"
                  :aria-label="`位置图标 ${icon}`"
                  :aria-pressed="localBasic.iconOverrides?.location === icon"
                  @click="updateIcon('location', icon)"
                >
                  <el-icon><component :is="Icons[icon as keyof typeof Icons]" /></el-icon>
                </button>
              </div>
            </el-popover>
          </div>
        </template>
        <el-input
          :model-value="localBasic.location"
          placeholder="例如：北京"
          @update:model-value="(location: string) => handleUpdate({ location })"
        />
      </el-form-item>

      <el-form-item label="出生日期（可选）">
        <el-date-picker
          :model-value="localBasic.birthDate"
          type="date"
          value-format="YYYY-MM-DD"
          format="YYYY 年 MM 月 DD 日"
          placeholder="选择出生日期"
          clearable
          class="w-full"
          @update:model-value="(birthDate: string | null) => handleUpdate({ birthDate: birthDate || '' })"
        />
        <p class="privacy-note">出生日期不显示在简历中；可选择是否显示年龄。</p>
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="显示年龄">
            <el-switch :model-value="localBasic.showAge" :disabled="!localBasic.birthDate" @update:model-value="(showAge: unknown) => handleUpdate({ showAge: !!showAge })" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="显示工作经验时长">
            <el-switch :model-value="localBasic.showExperienceYears" @update:model-value="(showExperienceYears: unknown) => handleUpdate({ showExperienceYears: !!showExperienceYears })" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="个人网站">
        <template #label>
          <div class="flex items-center gap-2">
            <span>个人网站</span>
             <el-popover placement="bottom" :width="200" trigger="click">
              <template #reference>
                <el-button link size="small" aria-label="更换个人网站图标" title="更换图标" :icon="Icons[(localBasic.iconOverrides?.website || 'Monitor') as keyof typeof Icons]">
                </el-button>
              </template>
              <div class="grid grid-cols-4 gap-2">
                <button
                  v-for="icon in iconOptions.website"
                  :key="icon"
                  type="button"
                  class="icon-option-button"
                  :class="{ 'is-active': localBasic.iconOverrides?.website === icon }"
                  :aria-label="`个人网站图标 ${icon}`"
                  :aria-pressed="localBasic.iconOverrides?.website === icon"
                  @click="updateIcon('website', icon)"
                >
                  <el-icon><component :is="Icons[icon as keyof typeof Icons]" /></el-icon>
                </button>
              </div>
            </el-popover>
          </div>
        </template>
        <el-input
          :model-value="localBasic.website"
          placeholder="https://..."
          @update:model-value="(website: string) => handleUpdate({ website })"
        />
      </el-form-item>

      <el-form-item label="自定义联系方式">
        <div class="custom-contact-list">
          <div v-for="contact in localBasic.customContacts || []" :key="contact.id" class="custom-contact-card">
            <div class="custom-contact-row">
              <el-input
                :model-value="contact.label"
                maxlength="30"
                placeholder="名称，如：微信"
                @update:model-value="(label: string) => updateCustomContact(contact.id, { label })"
              />
              <el-popover placement="bottom" :width="220" trigger="click">
                <template #reference>
                  <el-button
                    link
                    size="small"
                    :icon="Icons[(contact.icon || 'Link') as keyof typeof Icons]"
                    :aria-label="`${contact.label || '自定义联系方式'}图标`"
                  />
                </template>
                <div class="grid grid-cols-5 gap-2">
                  <button
                    v-for="icon in customContactIcons"
                    :key="icon"
                    type="button"
                    class="icon-option-button"
                    :class="{ 'is-active': contact.icon === icon }"
                    :aria-label="`联系方式图标 ${icon}`"
                    :aria-pressed="contact.icon === icon"
                    @click="updateCustomContact(contact.id, { icon })"
                  >
                    <el-icon><component :is="Icons[icon as keyof typeof Icons]" /></el-icon>
                  </button>
                </div>
              </el-popover>
              <EntryDeleteButton :label="contact.label.trim() || '自定义联系方式'" @confirm="removeCustomContact(contact.id)" />
            </div>
            <el-input
              :model-value="contact.value"
              maxlength="200"
              placeholder="填写联系方式内容"
              @update:model-value="(value: string) => updateCustomContact(contact.id, { value })"
            />
          </div>
          <el-button text type="primary" :icon="Plus" @click="addCustomContact">添加联系方式</el-button>
        </div>
      </el-form-item>

      <el-form-item label="个人简介" data-quality-id="basic-summary">
        <RichTextEditor
          :model-value="localBasic.summary || ''"
          @update:modelValue="(summary: string) => handleUpdate({ summary })"
        />
      </el-form-item>
    </el-form>

    <AvatarCropDialog
      v-model="cropVisible"
      :source="cropSource"
      :shape="localBasic.avatarShape"
      @confirm="applyCrop"
      @closed="handleCropClosed"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Plus, Edit } from '@element-plus/icons-vue';
import EntryDeleteButton from './EntryDeleteButton.vue';
import AvatarCropDialog from './AvatarCropDialog.vue';
import * as Icons from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { BasicInfo, CustomContact } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { loadAvatarImage, releaseAvatar, type LoadedAvatar } from '@/utils/avatarImage';
import { AVATAR_SHAPE_OPTIONS, avatarBorderRadius, normalizeAvatarShape } from '@/utils/avatarShape';
import RichTextEditor from '@/components/common/RichTextEditor.vue';
import { describeError } from '@/utils/globalErrorReporting';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const localBasic = computed(() => data.value.basic);

const handleUpdate = (updates: Partial<BasicInfo>) => {
  resumeStore.updateBasic(updates);
};

let avatarReadGeneration = 0;

const cropVisible = ref(false);
const cropSource = ref<LoadedAvatar | null>(null);
/** 取景框是为哪份简历打开的：期间切走简历时用它丢弃结果。 */
const cropResumeId = ref('');

onBeforeUnmount(() => {
  avatarReadGeneration++;
  releaseAvatar(cropSource.value);
});

const handleAvatarChange = (file: { raw?: File }) => {
  const raw = file.raw;
  if (!raw) return;
  const generation = ++avatarReadGeneration;
  const resumeId = data.value.id;
  // 先解码并取出源图，取景框里拖动的始终是原图，确认后才写进简历。
  void loadAvatarImage(raw).then((source) => {
    if (generation !== avatarReadGeneration || data.value.id !== resumeId || resumeStore.isLoading) {
      releaseAvatar(source);
      return;
    }
    releaseAvatar(cropSource.value);
    cropSource.value = source;
    cropResumeId.value = resumeId;
    cropVisible.value = true;
  }).catch((error: unknown) => {
    ElMessage.error(describeError(error));
  });
};

const applyCrop = (avatar: string) => {
  // 取景期间用户可能切走了简历：宁可丢弃这次取景，也不要把照片写进别的简历。
  if (data.value.id === cropResumeId.value && !resumeStore.isLoading) handleUpdate({ avatar });
  cropVisible.value = false;
};

/** 等关闭动画结束再释放对象 URL，否则淡出过程中图片会裂开。 */
const handleCropClosed = () => {
  releaseAvatar(cropSource.value);
  cropSource.value = null;
  cropResumeId.value = '';
};

const iconOptions = {
  email: ['Message', 'Postcard', 'Promotion', 'ChatDotRound'],
  phone: ['Iphone', 'Phone', 'Cellphone', 'Service'],
  location: ['Location', 'MapLocation', 'Place', 'House'],
  website: ['Monitor', 'Link', 'ChromeFilled', 'Compass', 'Platform'],
};

const updateIcon = (field: 'email' | 'phone' | 'location' | 'website', icon: string) => {
  handleUpdate({ iconOverrides: { ...localBasic.value.iconOverrides, [field]: icon } });
};

const customContactIcons = ['Link', 'Message', 'ChatDotRound', 'ChatLineRound', 'Position', 'Promotion', 'Connection', 'User', 'Star', 'Monitor'];

const addCustomContact = () => {
  handleUpdate({ customContacts: [...(localBasic.value.customContacts || []), { id: generateId(), label: '', value: '', icon: 'Link' }] });
};

const removeCustomContact = (id: string) => {
  handleUpdate({ customContacts: (localBasic.value.customContacts || []).filter(contact => contact.id !== id) });
};

const updateCustomContact = (id: string, updates: Partial<CustomContact>) => {
  handleUpdate({ customContacts: (localBasic.value.customContacts || []).map(contact => contact.id === id ? { ...contact, ...updates } : contact) });
};
</script>

<style scoped>
.basic-info-editor {
  width: 100%;
}

.avatar-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}

.avatar-shape {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.avatar-frame,
.avatar-empty {
  position: relative;
  display: flex;
  width: 96px;
  height: 96px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
}

.avatar-frame {
  border: var(--rule-hair) solid var(--color-rule);
  background: var(--color-paper-2);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* The edit mark sits on a scrim that only appears while the photo is pointed at or the uploader holds focus. */
.avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay);
  color: var(--color-accent-ink);
  font-size: var(--text-lg);
  opacity: 0;
  transition: opacity var(--dur-micro) var(--ease-out);
}

.avatar-uploader:focus-within .avatar-overlay {
  opacity: 1;
}

.avatar-empty {
  border: var(--rule-hair) dashed var(--color-rule-2);
  background: var(--color-paper-2);
  color: var(--color-muted);
  font-size: var(--text-xl);
  transition: border-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out), background-color var(--dur-micro) var(--ease-out);
}

.avatar-empty:active {
  background: var(--color-sunken);
}

@media (hover: hover) {
  .avatar-frame:hover .avatar-overlay {
    opacity: 1;
  }

  .avatar-empty:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}

@media (hover: none) {
  .avatar-overlay {
    opacity: 1;
    inset: auto 0 0;
    height: 32px;
    font-size: var(--text-md);
  }
}

.custom-contact-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
}

.custom-contact-card {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: var(--space-xs);
  padding-bottom: var(--space-sm);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.custom-contact-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.privacy-note {
  margin: var(--space-2xs) 0 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}
</style>
