// 页面进程崩了（V8 的 Fatal error / Check failed 之类），Remotion 不知道，一直等到等帧超时（10 分钟）才报，看着是不出帧、各进程 CPU 都是 0。
// 这里盯着浏览器进程的 stderr，一见崩溃原文就关掉浏览器，正在等的 renderStill / renderFrames 跟着失败，再换成带原文的报错（用户 11-10 定要马上报）。
// Remotion 不给浏览器进程：openBrowser 期间临时包一下 child_process.spawn 认出它（BrowserRunner.js 调的是 childProcess.spawn，按属性现取）。
// 顺带：Remotion 不开 verbose 时浏览器的 stderr 是接了管道没人读的，这里一直读着，也不会写满卡住浏览器。
import cp, { type ChildProcess } from 'node:child_process';

/** 浏览器 stderr 里算崩溃的行：V8 的致命错误和 DCHECK、Chromium 的 CHECK、内存不够 */
export const CRASH_PATTERN = /^#\s*Fatal error in |^#\s*(Debug )?[Cc]heck failed|^\[[^\]]*:FATAL:|Check failed: |Fatal JavaScript out of memory|Fatal process out of memory/m;

export class PageCrashError extends Error {
  readonly 原文: string;
  constructor(raw: string) {
    super(`浏览器页面进程崩了（不是在等加载，别原样重跑；缩小范围找是哪样东西撞的）。浏览器原文：\n${raw}`);
    this.原文 = raw;
    this.name = '页面崩溃';
  }
}

/** 从累积的 stderr 里摘崩溃那一段：从第一处崩溃行起，最多 40 行 */
export const excerptCrashText = (fullText: string): string | null => {
  const m = CRASH_PATTERN.exec(fullText);
  if (!m) return null;
  const startIndex = fullText.lastIndexOf('\n', m.index) + 1;
  return fullText.slice(startIndex).split('\n').slice(0, 40).join('\n').trimEnd();
};

export type CrashWatchdog = {
  /** 崩了就是原文，没崩是 null */
  原文: () => string | null;
  /** 跑 fn；fn 出错时浏览器崩过，就换成 页面崩溃（带原文） */
  包: <T>(fn: () => Promise<T>) => Promise<T>;
};

/**
 * 开浏览器并盯着它。开: 真正开浏览器的那一步（openBrowser）；可执行: 传给 openBrowser 的浏览器路径；崩了: 见到原文后调（关浏览器）。
 * 留 0.3 秒收齐后面的栈再调 崩了。
 */
export const openBrowserWithWatchdog = async <B>(launch: () => Promise<B>, exePath: string, onCrash: (b: B) => unknown): Promise<{ browser: B; watchdog: CrashWatchdog }> => {
  let browserProcess: ChildProcess | undefined;
  const origSpawn = cp.spawn;
  (cp as { spawn: unknown }).spawn = (...a: Parameters<typeof cp.spawn>) => {
    const p = (origSpawn as (...x: unknown[]) => ChildProcess)(...a);
    if (a[0] === exePath) browserProcess = p;
    return p;
  };
  let browser: B;
  try {
    browser = await launch();
  } finally {
    (cp as { spawn: unknown }).spawn = origSpawn;
  }
  let fullText = '';
  let raw: string | null = null;
  let reported = false;
  browserProcess?.stderr?.on('data', (d: Buffer) => {
    if (reported && raw) {
      raw = excerptCrashText(fullText += d.toString('utf8'));
      return;
    }
    // 只留最后 256 KB，够找崩溃那段
    fullText = (fullText + d.toString('utf8')).slice(-256 * 1024);
    const excerpt = excerptCrashText(fullText);
    if (!excerpt || reported) return;
    reported = true;
    raw = excerpt;
    setTimeout(() => void Promise.resolve(onCrash(browser)).catch(() => {}), 300);
  });
  return {
    browser,
    watchdog: {
      原文: () => raw,
      包: async (fn) => {
        try {
          return await fn();
        } catch (e) {
          if (raw) throw new PageCrashError(raw);
          throw e;
        }
      },
    },
  };
};
