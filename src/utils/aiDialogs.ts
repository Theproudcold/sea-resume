import { ElMessageBox } from 'element-plus';
import '@/styles/ai-dialogs.scss';

/** Explicit user actions use application dialogs; browser unload warnings stay native. */
export async function confirmAiAction(title: string, message: string, confirmButtonText: string, danger = false): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: danger ? 'warning' : 'info',
      confirmButtonText,
      cancelButtonText: '取消',
      confirmButtonClass: danger ? 'el-button--danger' : 'el-button--primary',
      closeOnClickModal: false,
      distinguishCancelAndClose: true,
      customClass: 'ai-confirm-dialog',
    });
    return true;
  } catch { return false; }
}
