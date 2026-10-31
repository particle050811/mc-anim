// render 渲完自动删旧母版、叠层的每条跳过规则，和 gc 同步的规则（用户 10-30 定：旧的过期的删，当前不删，没有预算）。数据根是临时目录，作品是现造的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-钉测试-'));
process.env.ANIM_DATA = 数据根;
const 作品根 = path.join(数据根, '假作品');
vi.mock('../环境/作品.ts', async (原) => ({ ...(await 原<typeof import('../环境/作品.ts')>()), 作品们: () => new Map([['假', 作品根]]), 作品名: () => '假' }));

const { 删旧, 删已取代, 有要删的旧 } = await import('./钉.ts');
const { 检出记号文件 } = await import('../渲/母版.ts');
const { 本检出 } = await import('../环境/路径.ts');
const { 规划媒体, 扫媒体, 保留集, 加交付, 加认可 } = await import('./回收.ts');
const { 认可参考文件, 母版目录, 叠层目录, 段签目录 } = await import('../环境/配置.ts');
const { 抽样键, 写认可, 认可文件 } = await import('../验收/认可.ts');

const 新 = 'a'.repeat(64);
const 旧 = 'b'.repeat(64);
const 旧16 = 旧.slice(0, 16);
const 键 = '甲';
const 现在 = Date.parse('2026-10-30T12:00:00Z');
const 小时 = 3600e3;
const 目录 = () => 母版目录(键, '假');

const 写指纹 = (dir: string, 指纹: string, 级别: string | null) => {
  fs.mkdirSync(dir, { recursive: true });
  const 项 = 级别 ? { 渲染设置: { inputProps: { 级别 } } } : {};
  fs.writeFileSync(path.join(dir, `${指纹.slice(0, 16)}.指纹.json`), JSON.stringify({ 段: 键, 指纹, 项 }));
};
/** 造一份旧母版：要哪几个文件；两份都有且 转过 时段签记着 CRF12 转自这份 CRF1（CRF1 算已被取代） */
const 旧母版 = (o: { 原?: boolean; 压?: boolean; 转过?: boolean; 级别?: string | null } = {}) => {
  const { 原 = false, 压 = true, 转过 = false, 级别 = '视频' } = o;
  写指纹(目录(), 旧, 级别);
  if (原) fs.writeFileSync(path.join(目录(), `${旧16}.mkv`), Buffer.alloc(100));
  if (压) fs.writeFileSync(path.join(目录(), `${旧16}.crf12.mkv`), Buffer.alloc(40));
  if (转过) {
    const dir = 段签目录(键, 旧, '假');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '签.json'), JSON.stringify({ 指纹: 旧, 母版: { 大小: 40, 转码自: { 大小: 100 } } }));
  }
};
const 在 = (后缀: string) => fs.existsSync(path.join(目录(), `${旧16}${后缀}`));
const 删 = (种: '母版' | '叠层' = '母版', k = 键) => 删旧(种, k, '视频', 新, { 作品: '假', 现在, 主检出: true });

const 交付 = (名: string, o: { 自足?: boolean; 有画面?: boolean } = {}) => {
  const dir = path.join(数据根, '交付', '假', 名);
  fs.mkdirSync(path.join(dir, '剪辑包'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ 版本: 2, 作品: '假', 段: [{ 键, 指纹: 旧 }], 叠层: [] }));
  if (o.自足) fs.writeFileSync(path.join(dir, '全片-未拉响度.flac'), '');
  if (o.自足 || o.有画面) fs.writeFileSync(path.join(dir, '剪辑包', '画面.mp4'), '');
};
const 认可记录 = {
  段: 键, 指纹: 旧, 平台: 'darwin-arm64', 渲染级别: '视频', 认可于: '2026-10-22T00:00:00Z', 提交: 'abc', 理由: '测试', 上一版指纹: null,
  宽: 4, 高: 4, 帧数: 1, 间隔: 24, 帧: [{ 帧: 0, 哈希: 'c'.repeat(64), 块均值: ['00'] }], 音频sha: null, 响度: null, 起音: null,
};
const 写认可记录 = () => 写认可(认可文件(键, 'darwin-arm64', 作品根), 认可记录);

beforeEach(() => {
  for (const d of ['cache', '交付', '段签', '认可参考']) fs.rmSync(path.join(数据根, d), { recursive: true, force: true });
  fs.rmSync(作品根, { recursive: true, force: true });
  fs.mkdirSync(作品根, { recursive: true });
  fs.writeFileSync(path.join(作品根, '交付.toml'), '剪辑包 = true\n');
});

describe('render 渲完删旧', () => {
  it('同段同级别别的指纹：CRF1、CRF12 都删，.指纹.json 留着，新指纹不动', () => {
    旧母版({ 原: true });
    写指纹(目录(), 新, '视频');
    const 新文件 = path.join(目录(), `${新.slice(0, 16)}.crf12.mkv`);
    fs.writeFileSync(新文件, Buffer.alloc(40));
    const r = 删();
    expect(r.删大小).toBe(140);
    expect(在('.mkv')).toBe(false);
    expect(在('.crf12.mkv')).toBe(false);
    expect(在('.指纹.json')).toBe(true);
    expect(fs.existsSync(新文件)).toBe(true);
  });

  it('别的级别的、级别读不出的不动', () => {
    旧母版({ 级别: '预览' });
    expect(删().删).toEqual([]);
    expect(在('.crf12.mkv')).toBe(true);
    旧母版({ 级别: null });
    expect(删().删).toEqual([]);
    expect(在('.crf12.mkv')).toBe(true);
  });

  it('还没自足的交付钉着 CRF12；CRF1 已被取代的删（这份交付不补画面了）', () => {
    旧母版({ 原: true, 转过: true });
    交付('没自足', { 有画面: true });
    const r = 删();
    expect(在('.crf12.mkv')).toBe(true);
    expect(在('.mkv')).toBe(false);
    expect(r.留[0]!.理由).toContain('交付');
  });

  it('交付待补画面（开了剪辑包）：要出片时那份，CRF1 也留', () => {
    旧母版({ 原: true, 转过: true });
    交付('待补');
    删();
    expect(在('.mkv')).toBe(true);
    expect(在('.crf12.mkv')).toBe(true);
  });

  it('交付自足了就不钉', () => {
    旧母版({ 原: true, 转过: true });
    交付('自足', { 自足: true });
    删();
    expect(在('.mkv')).toBe(false);
    expect(在('.crf12.mkv')).toBe(false);
  });

  it('认可没有参考：CRF1 留（verify 要逐像素比），CRF12 不留（不比它的像素）', () => {
    旧母版({ 原: true, 转过: true });
    写认可记录();
    删();
    expect(在('.mkv')).toBe(true);
    expect(在('.crf12.mkv')).toBe(false);
  });

  it('认可有参考了就不钉', () => {
    旧母版({ 原: true, 转过: true });
    写认可记录();
    const 参 = 认可参考文件(键, 旧, 抽样键(认可记录), 'darwin-arm64', '假');
    fs.mkdirSync(path.dirname(参), { recursive: true });
    fs.writeFileSync(参, '');
    删();
    expect(在('.mkv')).toBe(false);
    expect(在('.crf12.mkv')).toBe(false);
  });

  it('这个指纹正在写（.渲染中、.转码中）不删；过了一天的残留不算', () => {
    旧母版();
    const tmp = path.join(目录(), `${旧16}.渲染中-123.mkv`);
    fs.writeFileSync(tmp, '');
    fs.utimesSync(tmp, new Date(现在 - 小时), new Date(现在 - 小时));
    expect(删().留[0]!.理由).toContain('正在写');
    expect(在('.crf12.mkv')).toBe(true);
    fs.rmSync(tmp);
    const tmp2 = path.join(目录(), `${旧16}.转码中-123.crf12.mkv`);
    fs.writeFileSync(tmp2, '');
    fs.utimesSync(tmp2, new Date(现在 - 小时), new Date(现在 - 小时));
    expect(删().留[0]!.理由).toContain('正在写');
    fs.utimesSync(tmp2, new Date(现在 - 30 * 小时), new Date(现在 - 30 * 小时));
    删();
    expect(在('.crf12.mkv')).toBe(false);
  });

  it('近 2 小时用过的不删，过了 2 小时删', () => {
    旧母版();
    const 记 = path.join(目录(), `${旧16}.用过`);
    fs.writeFileSync(记, '');
    fs.utimesSync(记, new Date(现在 - 小时), new Date(现在 - 小时));
    expect(删().留[0]!.理由).toContain('2 小时内用过');
    expect(在('.crf12.mkv')).toBe(true);
    fs.utimesSync(记, new Date(现在 - 3 * 小时), new Date(现在 - 3 * 小时));
    删();
    expect(在('.crf12.mkv')).toBe(false);
    expect(fs.existsSync(记)).toBe(true);
  });

  it('worktree 里不自动删旧（可能是主检出的当前指纹）：CRF1、CRF12 都在，报留着', () => {
    旧母版({ 原: true });
    const r = 删旧('母版', 键, '视频', 新, { 作品: '假', 现在, 主检出: false });
    expect(r.删).toEqual([]);
    expect(r.留.map((x) => x.理由)).toEqual(['worktree 不自动删', 'worktree 不自动删']);
    expect(在('.mkv') && 在('.crf12.mkv')).toBe(true);
    expect(有要删的旧('母版', 键, '视频', 新, { 作品: '假', 现在, 主检出: false })).toBe(false);
  });

  it('命中时先问有没有要删的：没旧的、旧的都钉着都是 false，不用等闸', () => {
    const 问 = () => 有要删的旧('母版', 键, '视频', 新, { 作品: '假', 现在, 主检出: true });
    expect(问()).toBe(false);
    旧母版();
    expect(问()).toBe(true);
    交付('未自足');
    expect(问()).toBe(false);
  });

  it('别的检出用过的不删（它的当前指纹这边算不出）；那个检出删了就不算；自己的记号不算', () => {
    旧母版();
    const 别的 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-别的检出-'));
    fs.writeFileSync(检出记号文件(目录(), 旧, 别的), `${别的}\n`);
    expect(删().留[0]!.理由).toContain(`别的检出用过：${别的}`);
    expect(在('.crf12.mkv')).toBe(true);
    fs.rmSync(别的, { recursive: true });
    fs.writeFileSync(检出记号文件(目录(), 旧), `${本检出()}\n`);
    删();
    expect(在('.crf12.mkv')).toBe(false);
  });

  it('已被取代的 CRF1 用过也删（读者都读 CRF12），别的检出用过也删；CRF12 照留', () => {
    旧母版({ 原: true, 转过: true });
    const 别的 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-别的检出-'));
    fs.writeFileSync(path.join(目录(), `${旧16}.用过`), '');
    fs.utimesSync(path.join(目录(), `${旧16}.用过`), new Date(现在 - 小时), new Date(现在 - 小时));
    fs.writeFileSync(检出记号文件(目录(), 旧, 别的), `${别的}\n`);
    expect(删已取代(键, 旧, { 作品: '假', 现在 })).toBe(100);
    expect(在('.mkv')).toBe(false);
    expect(在('.crf12.mkv')).toBe(true);
    fs.rmSync(别的, { recursive: true });
  });

  it('叠层同一套', () => {
    const k = '甲-层';
    const dir = 叠层目录(k, '假');
    写指纹(dir, 旧, '视频');
    fs.writeFileSync(path.join(dir, `${旧16}.mov`), Buffer.alloc(10));
    expect(删('叠层', k).删大小).toBe(10);
    expect(fs.existsSync(path.join(dir, `${旧16}.mov`))).toBe(false);
  });

  it('删已取代：只删段签记着转过的 CRF1；没转过的不算', () => {
    旧母版({ 原: true });
    expect(删已取代(键, 旧, { 作品: '假', 现在 })).toBe(0);
    expect(在('.mkv')).toBe(true);
    旧母版({ 原: true, 转过: true });
    expect(删已取代(键, 旧, { 作品: '假', 现在 })).toBe(100);
    expect(在('.mkv')).toBe(false);
    expect(在('.crf12.mkv')).toBe(true);
  });
});

describe('gc 同步', () => {
  const 规划 = (配: (保留: InstanceType<typeof 保留集>) => void) => {
    const 保留 = new 保留集();
    配(保留);
    const 扫 = 扫媒体(path.join(数据根, 'cache', '母版', '假'), '母版', '假', { 段签目录: (k, f) => 段签目录(k, f, '假'), 现在 });
    return 规划媒体(扫.媒体, 保留, { 现在, 近期天数: 2 });
  };
  const 老 = (后缀: string) => {
    const f = path.join(目录(), `${旧16}${后缀}`);
    fs.utimesSync(f, new Date(现在 - 30 * 24 * 小时), new Date(现在 - 30 * 24 * 小时));
  };
  const 删的 = (r: ReturnType<typeof 规划>) => r.filter((f) => !f.理由.length).map((f) => path.basename(f.路径)).sort();

  it('当前指纹不删；它的 CRF1 被 CRF12 取代了才删（CRF12 按同名 CRF1 找当前理由）', () => {
    旧母版({ 原: true, 转过: true });
    const r = 规划((保) => 保.加(path.join(目录(), `${旧16}.mkv`), { 类: '当前', 说明: '视频' }));
    expect(删的(r)).toEqual([`${旧16}.mkv`]);
    expect(r.find((f) => f.存法 === 'crf12')!.理由.some((x) => x.类 === '当前')).toBe(true);
  });

  it('只有 CRF1 的当前指纹留着（没转存的不算取代）', () => {
    旧母版({ 原: true, 压: false });
    老('.mkv');
    const r = 规划((保) => 保.加(path.join(目录(), `${旧16}.mkv`), { 类: '当前', 说明: '视频' }));
    expect(删的(r)).toEqual([]);
  });

  it('过期的（被更新的指纹取代）删；交付自足后不再引用的也删；未自足的留', () => {
    旧母版();
    老('.crf12.mkv');
    写指纹(目录(), 新, '视频');
    fs.writeFileSync(path.join(目录(), `${新.slice(0, 16)}.crf12.mkv`), Buffer.alloc(40));
    // 新指纹的 json 写得晚才算最近一份
    fs.utimesSync(path.join(目录(), `${旧16}.指纹.json`), new Date(现在 - 30 * 24 * 小时), new Date(现在 - 30 * 24 * 小时));
    const 配 = (保: InstanceType<typeof 保留集>) => {
      加交付(保, path.join(数据根, '交付'), 数据根, () => {}, { 解钉: true, 开剪辑包: () => true });
      加认可(保, 作品根, (k) => 母版目录(k, '假'), () => {}, { 解钉: true });
    };
    expect(删的(规划(配))).toEqual([`${旧16}.crf12.mkv`]);
    交付('未自足');
    expect(删的(规划(配))).toEqual([]);
    fs.rmSync(path.join(数据根, '交付'), { recursive: true });
    交付('自足', { 自足: true });
    expect(删的(规划(配))).toEqual([`${旧16}.crf12.mkv`]);
  });
});
