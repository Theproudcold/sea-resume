/**
 * 上游 widget 只把握手结果留在自己的闭包里。这里插入三次通知，
 * 让宿主页能区分「资源已加载」和「本机 relay 已连上」。不改协议、重连或工具转发。
 */
const NOTIFY = 'window.parent.postMessage({type:`sea-resume.relay`,state:';
const TARGET = '},e.hostOrigin)';

const PATCHES: ReadonlyArray<readonly [string, string]> = [
  [
    'o.type===`hello/accepted`){_(),s=!0,g=0',
    `o.type===\`hello/accepted\`){${NOTIFY}\`connected\`${TARGET},_(),s=!0,g=0`,
  ],
  [
    'o===r&&(s=!1,o=null,_(),C?I():F())',
    `o===r&&(${NOTIFY}\`reconnecting\`${TARGET},s=!1,o=null,_(),C?I():F())`,
  ],
  [
    'p!==`dormant`&&(p=`dormant`',
    `p!==\`dormant\`&&(${NOTIFY}\`reconnecting\`${TARGET},p=\`dormant\``,
  ],
];

export function patchRelayWidget(source: string, label: string): string {
  let patched = source;
  for (const [marker, replacement] of PATCHES) {
    if (!patched.includes(marker)) throw new Error(`relay ${label} 与已固定的 6.0.3 不一致，缺少连接状态插入点。`);
    patched = patched.replace(marker, replacement);
  }
  return patched;
}
