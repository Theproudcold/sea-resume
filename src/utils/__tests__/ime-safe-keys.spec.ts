import { describe, expect, it, vi } from 'vitest';
import { imeSafeKeyHandler, isImeConfirmKey } from '../imeSafeKeys';

/** 只造出判断所需的两个字段，避免依赖 jsdom 对 KeyboardEventInit 的支持程度。 */
function keyEvent(props: { isComposing?: boolean; keyCode?: number } = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
  if (props.isComposing !== undefined) Object.defineProperty(event, 'isComposing', { value: props.isComposing });
  if (props.keyCode !== undefined) Object.defineProperty(event, 'keyCode', { value: props.keyCode });
  return event;
}

describe('imeSafeKeys', () => {
  it('认出输入法确认候选词的键', () => {
    expect(isImeConfirmKey(keyEvent({ isComposing: true }))).toBe(true);
    // Safari 在 keydown 到达脚本前已把 isComposing 重置，只剩 keyCode 229。
    expect(isImeConfirmKey(keyEvent({ keyCode: 229 }))).toBe(true);
    expect(isImeConfirmKey(keyEvent({ isComposing: false, keyCode: 13 }))).toBe(false);
  });

  it('确认候选词时既不执行处理函数，也不阻止默认行为', () => {
    const handle = vi.fn();
    const event = keyEvent({ isComposing: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    imeSafeKeyHandler(handle)(event);

    expect(handle).not.toHaveBeenCalled();
    // 抢着 preventDefault 会打断候选词上屏。
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('Safari 顺序下同样不误触发', () => {
    const handle = vi.fn();
    imeSafeKeyHandler(handle)(keyEvent({ keyCode: 229 }));
    expect(handle).not.toHaveBeenCalled();
  });

  it('真正的回车才提交，并阻止表单隐式提交', () => {
    const handle = vi.fn();
    const event = keyEvent({ isComposing: false, keyCode: 13 });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    imeSafeKeyHandler(handle)(event);

    expect(handle).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
