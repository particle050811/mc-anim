// 求解缓存（engine/core/求解缓存.ts）的写盘：页面写不了文件，新算出来的结果挂在 window.__求解缓存待写，这里在页面关掉前收走，
// 写进 <数据根>/cache/求解/（页面经 public 目录的 求解 链接从这里读）。照旧项目 工具/求解缓存收集.mjs。
// 用法：开浏览器后调一次 收求解缓存(browser)；Remotion 的 getCompositions、renderMedia 都经 browser.newPage 开页面、用完 page.close()，
// 包住这两个就收得到每个页面的结果。同一个键内容一样，已有的文件不重写。
import fs from 'node:fs';
import path from 'node:path';
import type { HeadlessBrowser } from '@remotion/renderer';
import { 求解缓存目录 } from '../环境/配置.ts';

type 页面 = { _client: () => { send: (方法: string, 参数: object) => Promise<unknown> }; close: (...a: unknown[]) => Promise<unknown> };

const 收一页 = async (page: 页面, dir: string) => {
  const r = (await page._client().send('Runtime.evaluate', { expression: 'JSON.stringify(window.__求解缓存待写 || {})', returnByValue: true })) as {
    value?: { result: { value: string } };
    result?: { value: string };
  };
  const 待写 = JSON.parse((r.value ?? r).result!.value) as Record<string, string>;
  let 新写 = 0;
  for (const [文件名, 内容] of Object.entries(待写)) {
    if (!/^[0-9a-f]{16}\.json$/.test(文件名)) continue;
    const file = path.join(dir, 文件名);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, 内容);
    fs.renameSync(`${file}.tmp`, file);
    新写++;
  }
  if (新写) console.log(`求解缓存：新写 ${新写} 份`);
};

// Remotion 关页面时不等 close 完（get-browser-instance.js 的 cleanupPage），收缓存是异步写完的：
// 开下一个页面前先 等求解缓存写完()，不然后面的页面加载时文件可能还没写好，又现算一遍
const 在收 = new Set<Promise<void>>();
export const 等求解缓存写完 = () => Promise.all([...在收]);

export const 收求解缓存 = (browser: HeadlessBrowser) => {
  const dir = 求解缓存目录();
  const b = browser as unknown as { newPage: (...a: unknown[]) => Promise<页面> };
  const 原newPage = b.newPage.bind(b);
  b.newPage = async (...a) => {
    const page = await 原newPage(...a);
    const 原close = page.close.bind(page);
    page.close = async (...c) => {
      // 页面崩了、已经跳走了就收不到，下次再算
      const task = 收一页(page, dir).catch(() => {});
      在收.add(task);
      await task;
      在收.delete(task);
      return 原close(...c);
    };
    return page;
  };
};
