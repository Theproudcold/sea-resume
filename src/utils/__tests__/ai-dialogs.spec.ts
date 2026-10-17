import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElMessageBox } from 'element-plus';
import { confirmAiAction } from '../aiDialogs';
afterEach(() => vi.restoreAllMocks());
describe('AI app confirmations', () => {
  it('uses an explicit danger action and does not close on an accidental overlay click', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(vi.fn().mockResolvedValue('confirm'));
    await expect(confirmAiAction('删除记录？', '不会删除简历。', '删除记录', true)).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith('不会删除简历。', '删除记录？', expect.objectContaining({ confirmButtonText: '删除记录', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger', closeOnClickModal: false }));
  });
  it.each(['cancel', 'close'])('treats %s as a non-destructive cancellation', async action => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(action);
    await expect(confirmAiAction('离开？', '未保存', '仍然离开')).resolves.toBe(false);
  });
});
