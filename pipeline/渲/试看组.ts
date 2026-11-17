// anim still 一次出几组试看参数：--trial '<JSON>'（可重复，一个值也可以是 JSON 数组 = 几组）、--baseline 再出一组不加 --trial 的、--contact 出接触表。
// 一次会话只打包一次、开一次浏览器；每组开一个新页面：Remotion 在开页时把 envVariables 写进页面（set-props-and-env），
// 模块求值时就读试看参数（细分门槛、着色块这类），同一页里换不了，所以一组一页是最省的。
// 每组 = shell 里的 REMOTION_ANIM_TRIAL（各组都带）浅合并上这一组；基准 = 只有 shell 那份。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { UsageError } from '../cli/参数.ts';
import { runCmd } from '../环境/子进程.ts';
import { prepareBrowser } from './浏览器.ts';
import { checkTrialTable, trialShortName, type TrialTable } from './试看表.ts';
import { shellTrialTable, trialEnvName, trialTerrain } from './地形注入.ts';

export type TrialGroup = {
  /** 0 起；基准是 0（给了 --baseline 时），其余按命令行顺序 */
  index: number;
  /** 这一组自己加的（不含 shell 那份），短名照它起 */
  delta: TrialTable;
  /** 转给页面的整张表 */
  table: TrialTable;
  shortName: string;
  /** 这组要多读的地形包（表里的「地形」） */
  terrain: string[];
  /** 给页面的环境变量：表是空的就不传 */
  env: Record<string, string>;
};

const groupOf = (index: number, delta: TrialTable, base: TrialTable): TrialGroup => {
  const table = { ...base, ...delta };
  return {
    index,
    delta,
    table,
    shortName: trialShortName(delta),
    terrain: trialTerrain(table),
    env: Object.keys(table).length ? { [trialEnvName]: JSON.stringify(table) } : {},
  };
};

/** --trial 的各个值 → 几组；baseline 时最前面加一组基准。两组短名一样（参数一样）报错 */
export const parseTrialGroups = (values: readonly string[], baseline: boolean, base: TrialTable = shellTrialTable()): TrialGroup[] => {
  const deltas: TrialTable[] = [];
  for (const v of values) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(v);
    } catch (e) {
      throw new UsageError(`--trial 要是 JSON 对象或对象数组：${(e as Error).message}（${v}）`);
    }
    for (const t of Array.isArray(parsed) ? parsed : [parsed]) {
      try {
        for (const n of checkTrialTable(t, '--trial')) console.error(`!! ${n}`);
      } catch (e) {
        throw new UsageError((e as Error).message);
      }
      deltas.push(t as TrialTable);
    }
  }
  if (!deltas.length) throw new UsageError('--trial 至少给一组');
  const groups = [...(baseline ? [{}] : []), ...deltas].map((d, i) => groupOf(i, d, base));
  const seen = new Map<string, number>();
  for (const g of groups) {
    const dup = seen.get(g.shortName);
    if (dup !== undefined) throw new UsageError(`第 ${dup} 组和第 ${g.index} 组的参数一样（${g.shortName}）`);
    seen.set(g.shortName, g.index);
  }
  return groups;
};

/** 文件名后缀：-试看<序号>-<短名>（序号让同一帧的几组排在一起、按命令行顺序） */
export const trialSuffix = (g: TrialGroup) => `-试看${g.index}-${g.shortName}`;

const pngSize = (file: string): [number, number] => {
  const b = fs.readFileSync(file).subarray(0, 24);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

const htmlEscape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * 接触表：同一帧的几组拼一张 PNG，每格上面标组号和短名。用渲染用的那个 chrome-headless-shell 截一张本地 HTML（中文标签要字体，ffmpeg 没带 drawtext）。
 * 一格最宽 1920（4K 原图缩一半），两组并排、三组以上每行 3 格
 */
export const writeContactSheet = async (tiles: { file: string; label: string }[], out: string) => {
  const [w0, h0] = pngSize(tiles[0]!.file);
  const cols = tiles.length <= 2 ? tiles.length : 3;
  const rows = Math.ceil(tiles.length / cols);
  const tileW = Math.min(1920, w0);
  const tileH = Math.round((tileW * h0) / w0);
  const labelH = 64;
  const width = cols * tileW;
  const height = rows * (tileH + labelH);
  const dir = path.dirname(out);
  const cells = tiles
    .map((t) => `<div class="c"><div class="l">${htmlEscape(t.label)}</div><img src="${encodeURI(path.basename(t.file))}"></div>`)
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{width:${width}px;background:#111;display:flex;flex-wrap:wrap}
.c{width:${tileW}px;height:${tileH + labelH}px}.l{height:${labelH}px;line-height:${labelH}px;padding:0 16px;color:#fff;font:600 34px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
img{display:block;width:${tileW}px;height:${tileH}px}</style>${cells}`;
  const htmlFile = path.join(dir, `.接触表-${process.pid}.html`);
  fs.writeFileSync(htmlFile, html);
  try {
    const exe = await prepareBrowser();
    await runCmd([exe, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${width},${height}`, `--screenshot=${out}`, pathToFileURL(htmlFile).href], { quiet: true });
  } finally {
    fs.rmSync(htmlFile, { force: true });
  }
  if (!fs.existsSync(out)) throw new Error(`接触表没截出来：${out}`);
};

/** 预览夹里的 00-说明.md 底稿（已经有就不动）：每组一个小标题（组号 + 短名），下面是这组的 JSON 和图；末尾留「你的回复：」 */
export const writeTrialReadme = (dir: string, o: { segKey: string; frames: readonly number[]; groups: readonly TrialGroup[]; base: TrialTable; files: (g: TrialGroup) => string[]; contactSheets: string[]; timing?: string }) => {
  const f = path.join(dir, '00-说明.md');
  if (fs.existsSync(f)) return;
  const lines = [`# ${o.segKey} 第 ${o.frames.join('、')} 帧：试看 ${o.groups.length} 组`, ''];
  if (Object.keys(o.base).length) lines.push(`各组都带 shell 里的 ${trialEnvName}：\`${JSON.stringify(o.base)}\``, '');
  if (o.timing) lines.push(o.timing, '');
  for (const g of o.groups) {
    lines.push(`## ${g.index} ${g.shortName}`, '', Object.keys(g.delta).length ? `\`${JSON.stringify(g.delta)}\`` : '不加 --trial 的参数', '');
    for (const file of o.files(g)) lines.push(`![${path.basename(file, '.png')}](${path.basename(file)})`);
    lines.push('');
  }
  if (o.contactSheets.length) {
    lines.push('## 接触表', '');
    for (const c of o.contactSheets) lines.push(`![${path.basename(c, '.png')}](${path.basename(c)})`);
    lines.push('');
  }
  lines.push('你的回复：', '');
  fs.writeFileSync(f, lines.join('\n'));
};
