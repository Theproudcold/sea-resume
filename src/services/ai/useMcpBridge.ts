import { ref } from 'vue';
import { useRouter, type Router } from 'vue-router';
import { metaFromResume, storageManager } from '@/services/storage/StorageManager';
import { useInterviewStore } from '@/stores/interview';
import { useResumeStore } from '@/stores/resume';
import { useWorkbenchStore } from '@/stores/workbench';
import { aiWorkspaceRepository } from './AiWorkspaceRepository';
import { getAiSessionApiKey, loadAiModelSettings, toAiProviderConfig } from './AiSettings';
import { startExternalAiBridge, type RelayLinkState } from './externalAiBridge';
import { assertNoActiveInterview, createResumeLibrary, type ResumeCatalog } from './resumeLibrary';
import { createResumePdfBlob, downloadPdfBlob } from '@/utils/export-pdf';
import type { InterviewSession, InterviewSettings } from '@/types/interview';
import type { ResumeData } from '@/types/resume';

const linkState = ref<RelayLinkState | ''>('');
const started = ref(false);
const connecting = ref(false);
const errorMessage = ref('');
let stopBridge: (() => void) | undefined;
let controller: AbortController | undefined;

function browserCatalog(router: Router): ResumeCatalog {
  return {
    list: () => storageManager.list(),
    read: (id) => storageManager.read(id),
    async save(resume) {
      const editor = useResumeStore();
      if (editor.data.id === resume.id && editor.discardedId !== resume.id) {
        await editor.importData(resume);
        useWorkbenchStore().upsertMeta(metaFromResume(editor.exportData()));
        return;
      }
      await storageManager.saveResume(resume);
      useWorkbenchStore().upsertMeta(metaFromResume(resume));
    },
    remove: (id) => storageManager.delete(id),
    async discardOpen(id) {
      const editor = useResumeStore();
      if (editor.data.id !== id) return;
      await editor.flushSave().catch(() => undefined);
      editor.discardOpenResume();
      if (router.currentRoute.value.path.startsWith('/editor')) await router.push('/');
    },
    async exportPdf(resume: ResumeData) {
      downloadPdfBlob(await createResumePdfBlob(resume), resume.title || resume.basic.name || 'resume');
    },
    interviews: {
      list: () => aiWorkspaceRepository.list<InterviewSession>('interview'),
      get: (id) => aiWorkspaceRepository.get<InterviewSession>('interview', id),
      async remove(id) {
        const store = useInterviewStore();
        if (store.session?.id === id) {
          await store.setPersistence(false);
          store.reset();
        }
        await aiWorkspaceRepository.delete('interview', id);
      },
      async start(resume, settings: InterviewSettings) {
        const store = useInterviewStore();
        assertNoActiveInterview(store.busy || !!store.session);
        const configured = loadAiModelSettings();
        const config = toAiProviderConfig(configured, getAiSessionApiKey(configured?.profileId));
        await store.start(resume, settings, config, { consent: true, persistence: true });
        return store.session ? JSON.parse(JSON.stringify(store.session)) as InterviewSession : null;
      },
    },
  };
}

/** The bridge stays up when the user leaves the workbench. Only the stop button tears it down. */
export function useMcpBridge() {
  const router = useRouter();
  async function connect() {
    if (connecting.value || started.value) return;
    connecting.value = true;
    errorMessage.value = '';
    const current = new AbortController();
    controller = current;
    try {
      stopBridge = await startExternalAiBridge(createResumeLibrary(browserCatalog(router)), current.signal, (state) => {
        if (controller === current) linkState.value = state;
      });
      started.value = true;
    } catch (error) {
      if (!current.signal.aborted) errorMessage.value = error instanceof Error ? error.message : '连接失败。';
    } finally {
      if (controller === current) connecting.value = false;
    }
  }
  function disconnect() {
    controller?.abort();
    stopBridge?.();
    stopBridge = undefined;
    started.value = false;
    linkState.value = '';
    connecting.value = false;
  }
  return { linkState, started, connecting, errorMessage, connect, disconnect };
}
