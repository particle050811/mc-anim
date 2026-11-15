// 求解缓存（engine/core/求解缓存.ts）的写盘：页面写不了文件，新算出来的结果挂在 window.__solveCachePending，这里在页面关掉前收走，
// 写进 <数据根>/cache/求解/（页面经 public 目录的 求解 链接从这里读）。照旧项目 工具/求解缓存收集.mjs。
// 用法：开浏览器后调一次 收求解缓存(browser)；Remotion 的 getCompositions、renderMedia 都经 browser.newPage 开页面、用完 page.close()，
// 包住这两个就收得到每个页面的结果。同一个键内容一样，已有的文件不重写。
import fs from 'node:fs';
import path from 'node:path';
import type { HeadlessBrowser } from '@remotion/renderer';
import { solveCacheDir } from '../环境/配置.ts';

type PageLike = { _client: () => { send: (method: string, params: object) => Promise<unknown> }; close: (...a: unknown[]) => Promise<unknown> };

/** 接到浏览器上：之后每个页面关掉前跑一次 收（拿 求值 在页面里取字符串）。页面崩了、已经跳走了就收不到，算了；在收的任务放进 在收，给调用方等 */
export const beforeClose = (browser: HeadlessBrowser, inFlight: Set<Promise<void>>, collect: (evaluate: (expression: string) => Promise<string>) => Promise<void>) => {
  const b = browser as unknown as { newPage: (...a: unknown[]) => Promise<PageLike> };
  const origNewPage = b.newPage.bind(b);
  b.newPage = async (...a) => {
    const page = await origNewPage(...a);
    const origClose = page.close.bind(page);
    const evaluate = async (expression: string) => {
      const r = (await page._client().send('Runtime.evaluate', { expression: expression, returnByValue: true })) as { value?: { result: { value: string } }; result?: { value: string } };
      return (r.value ?? r).result!.value;
    };
    page.close = async (...c) => {
      const task = collect(evaluate).catch(() => {});
      inFlight.add(task);
      await task;
      inFlight.delete(task);
      return origClose(...c);
    };
    return page;
  };
};

const collectPage = async (evaluate: (expression: string) => Promise<string>, dir: string) => {
  const pendingWrites = JSON.parse(await evaluate('JSON.stringify(window.__solveCachePending || {})')) as Record<string, string>;
  let newWrites = 0;
  for (const [fileName, content] of Object.entries(pendingWrites)) {
    if (!/^[0-9a-f]{16}\.json$/.test(fileName)) continue;
    const file = path.join(dir, fileName);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, content);
    fs.renameSync(`${file}.tmp`, file);
    newWrites++;
  }
  if (newWrites) console.log(`求解缓存：新写 ${newWrites} 份`);
  return newWrites;
};

// Remotion 关页面时不等 close 完（get-browser-instance.js 的 cleanupPage），收缓存是异步写完的：
// 开下一个页面前先 等求解缓存写完()，不然后面的页面加载时文件可能还没写好，又现算一遍
const inFlight = new Set<Promise<void>>();
export const waitSolveCacheWrites = () => Promise.all([...inFlight]);

export const collectSolveCache = (browser: HeadlessBrowser) => {
  const dir = solveCacheDir();
  const stats = { 新写: 0 };
  beforeClose(browser, inFlight, async (evaluate) => { stats.新写 += await collectPage(evaluate, dir); });
  return stats;
};
