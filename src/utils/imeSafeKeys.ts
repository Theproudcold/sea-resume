/**
 * 输入法（拼音、日文、韩文）用 Enter 确认候选词、用 Esc 取消候选，
 * 和「提交 / 取消编辑」用的是同一个键。不做判断就会在选词时误提交。
 *
 * 判断必须挂在 `keydown` 上：`keyup` 一定晚于 `compositionend`，
 * 此时 `isComposing` 已被重置为 false，无法再识别输入法。
 * - `isComposing`：Chrome / Firefox 在确认键的 keydown 上置为 true。
 * - `keyCode === 229`（VK_PROCESSKEY）：Safari 的事件投递顺序颠倒，
 *   keydown 到达脚本时 `isComposing` 已被重置，只能靠 keyCode 兜底。
 */
export function isImeConfirmKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

/**
 * 把 Enter / Esc 的键处理包成输入法安全版本：
 * 输入法确认候选词时放行，让输入法自己把字上屏；只有真正的提交/取消按键
 * 才执行 handler，并阻止其默认行为（单行 input 在 form 内会触发隐式提交，
 * 导致重复提交）。守卫必须放在 `preventDefault()` 之前，
 * 否则会在输入法确认时打断候选词上屏。
 */
export function imeSafeKeyHandler(handler: (event: KeyboardEvent) => void) {
  return (event: KeyboardEvent) => {
    if (isImeConfirmKey(event)) return;
    event.preventDefault();
    handler(event);
  };
}
