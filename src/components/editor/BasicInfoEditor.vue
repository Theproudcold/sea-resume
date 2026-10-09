<template>
  <div class="basic-info-editor space-y-4">
    <el-form label-position="top">
      <el-form-item label="头像">
        <el-upload
          class="avatar-uploader"
          :show-file-list="false"
          :auto-upload="false"
          :on-change="handleAvatarChange"
          accept="image/*"
        >
          <div v-if="localBasic.avatar" class="relative group cursor-pointer">
            <img :src="localBasic.avatar" class="w-24 h-24 rounded-full object-cover border border-gray-200" />
            <div class="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <el-icon class="text-white text-xl"><Edit /></el-icon>
            </div>
          </div>
          <div v-else class="w-24 h-24 rounded-full border border-dashed border-gray-300 flex items-center justify-center hover:border-blue-500 transition-colors cursor-pointer text-gray-400 hover:text-blue-500">
            <el-icon class="text-2xl"><Plus /></el-icon>
          </div>
        </el-upload>
      </el-form-item>

      <el-form-item label="姓名" required>
        <el-input
          v-model="localBasic.name"
          placeholder="请输入姓名"
          @input="handleUpdate"
        />
      </el-form-item>

      <el-form-item label="求职意向" required>
        <el-input
          v-model="localBasic.title"
          placeholder="例如：前端工程师"
          @input="handleUpdate"
        />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="邮箱" required class="relative">
            <template #label>
              <div class="flex items-center gap-2">
                <span>邮箱</span>
                <el-popover placement="bottom" :width="200" trigger="click">
                  <template #reference>
                    <el-button link size="small" :icon="Icons[(localBasic.iconOverrides?.email || 'Message') as keyof typeof Icons]">
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
              v-model="localBasic.email"
              placeholder="your@email.com"
              type="email"
              @input="handleUpdate"
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
                    <el-button link size="small" :icon="Icons[(localBasic.iconOverrides?.phone || 'Iphone') as keyof typeof Icons]">
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
              v-model="localBasic.phone"
              placeholder="手机号码"
              @input="handleUpdate"
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
                <el-button link size="small" :icon="Icons[(localBasic.iconOverrides?.location || 'Location') as keyof typeof Icons]">
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
          v-model="localBasic.location"
          placeholder="例如：北京"
          @input="handleUpdate"
        />
      </el-form-item>

      <el-form-item label="出生日期（可选）">
        <el-date-picker
          v-model="localBasic.birthDate"
          type="date"
          value-format="YYYY-MM-DD"
          format="YYYY 年 MM 月 DD 日"
          placeholder="仅本地保存，用于年龄计算"
          clearable
          class="w-full"
          @change="handleUpdate"
        />
        <p class="privacy-note">生日默认不会显示在简历；只有开启“显示年龄”后才会在预览/打印中显示。</p>
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="显示年龄">
            <el-switch v-model="localBasic.showAge" :disabled="!localBasic.birthDate" @change="handleUpdate" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="显示工作经验时长">
            <el-switch v-model="localBasic.showExperienceYears" @change="handleUpdate" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="个人网站">
        <template #label>
          <div class="flex items-center gap-2">
            <span>个人网站</span>
             <el-popover placement="bottom" :width="200" trigger="click">
              <template #reference>
                <el-button link size="small" :icon="Icons[(localBasic.iconOverrides?.website || 'Monitor') as keyof typeof Icons]">
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
          v-model="localBasic.website"
          placeholder="https://..."
          @input="handleUpdate"
        />
      </el-form-item>

      <el-form-item label="个人简介">
        <RichTextEditor
          :model-value="localBasic.summary || ''"
          @update:modelValue="(val: string) => { localBasic.summary = val; handleUpdate(); }"
        />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Plus, Edit } from '@element-plus/icons-vue';
import * as Icons from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { BasicInfo } from '@/types/resume';
import RichTextEditor from '@/components/common/RichTextEditor.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const localBasic = ref<BasicInfo>({ ...data.value.basic });

// 监听 store 变化更新本地数据
watch(() => data.value.basic, (newVal) => {
  localBasic.value = { ...newVal };
}, { deep: true });

const handleUpdate = () => {
  resumeStore.updateBasic(localBasic.value);
};

const handleAvatarChange = (file: any) => {
  const isJPG = file.raw.type === 'image/jpeg' || file.raw.type === 'image/png';
  const isLt2M = file.raw.size / 1024 / 1024 < 2;

  if (!isJPG) {
    ElMessage.error('上传头像图片只能是 JPG/PNG 格式!');
    return;
  }
  if (!isLt2M) {
    ElMessage.error('上传头像图片大小不能超过 2MB!');
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file.raw);
  reader.onload = () => {
    localBasic.value.avatar = reader.result as string;
    handleUpdate();
  };
};

const iconOptions = {
  email: ['Message', 'Postcard', 'Promotion', 'ChatDotRound'],
  phone: ['Iphone', 'Phone', 'Cellphone', 'Service'],
  location: ['Location', 'MapLocation', 'Place', 'House'],
  website: ['Monitor', 'Link', 'ChromeFilled', 'Compass', 'Platform'],
};

const updateIcon = (field: 'email' | 'phone' | 'location' | 'website', icon: string) => {
  if (!localBasic.value.iconOverrides) {
    localBasic.value.iconOverrides = {};
  }
  localBasic.value.iconOverrides[field] = icon;
  handleUpdate();
};
</script>

<style scoped>
.basic-info-editor {
  width: 100%;
}
.privacy-note {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-xs);
  line-height: 1.4;
}
</style>
