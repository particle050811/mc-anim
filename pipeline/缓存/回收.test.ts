// anim cache gc 的保留集和各类规划：在临时目录里现造母版、认可记录、交付 manifest，不碰数据根。
// 最要紧的一条：认可那版的母版不能删（删了 verify 只能退回去比块均值）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 历史指纹 } from '../渲/母版.ts';
import { 认可文本, type 认可记录 } from '../验收/认可.ts';
import { 加当前指纹 } from './当前指纹.ts';
import { 执行回收, type 回收计划 } from './计划.ts';
import {
  保留集, 加交付, 加认可, 交付引用, 扫媒体, 扫webpack, 列目录, 是临时名, 规划媒体, 规划临时, 规划草稿, 规划webpack, 读认可指纹, 小计, 主要理由, 不认识条目,
} from './回收.ts';

const 天 = 24 * 3600 * 1000;
const 现在 = Date.parse('2026-10-30T00:00:00Z');
let 根 = '';

beforeEach(() => {
  根 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-回收样例-')));
});
afterEach(() => fs.rmSync(根, { recursive: true, force: true }));

const 写 = (rel: string, 内容: string | Buffer, 改于?: number) => {
  const f = path.join(根, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 内容);
  // 目录的修改时间跟着拨（真目录里是最后一次往里加文件的时间）
  if (改于 !== undefined) for (const x of [f, path.dirname(f)]) fs.utimesSync(x, new Date(改于), new Date(改于));
  return f;
};

/** 造一份母版和它的 .指纹.json：指纹 16 位、级别、几天前渲的 */
const 母版 = (键: string, 指纹: string, 级别: string, 几天前: number, 大小 = 100) => {
  const t = 现在 - 几天前 * 天;
  写(`cache/母版/作品甲/${键}/${指纹}.指纹.json`, JSON.stringify({ 段: 键, 指纹: 指纹.padEnd(64, '0'), 项: { 渲染设置: { inputProps: { 级别 } } } }), t);
  return 写(`cache/母版/作品甲/${键}/${指纹}.mkv`, Buffer.alloc(大小, 指纹.charCodeAt(0)), t);
};
const 母版目录 = (键: string) => path.join(根, 'cache', '母版', '作品甲', 键);
const 规划 = (保留: 保留集, 近期天数 = 2) => 规划媒体(扫媒体(path.join(根, 'cache', '母版', '作品甲'), '母版', '作品甲').媒体, 保留, { 现在, 近期天数 });
const 删的 = (r: ReturnType<typeof 规划>) => r.filter((f) => !f.理由.length).map((f) => f.指纹).sort();

const 认可记录 = (段: string, 指纹: string): 认可记录 => ({
  段, 指纹, 平台: 'darwin-arm64', 渲染级别: '视频', 认可于: '2026-10-22T00:00:00Z', 提交: 'abc', 理由: '测试', 上一版指纹: 'b'.repeat(64),
  宽: 4, 高: 4, 帧数: 1, 间隔: 24, 帧: [{ 帧: 0, 哈希: 'c'.repeat(64), 块均值: ['00'] }], 音频sha: null, 响度: null, 起音: null,
});

describe('保留集：母版', () => {
  it('认可那版不删，哪怕它既不是当前、也不是最近一份、也不在近期里', () => {
    母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9); // 认可那版
    母版('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8); // 旧的，删
    母版('6-甲', 'cccccccccccccccc', '视频', 7); // 当前
    写('作品/作品甲/认可/darwin-arm64/6-甲.toml', 认可文本(认可记录('6-甲', 'a'.repeat(16) + 'f'.repeat(48))));
    const 保留 = new 保留集();
    加认可(保留, path.join(根, '作品', '作品甲'), 母版目录);
    保留.加(path.join(母版目录('6-甲'), 'cccccccccccccccc.mkv'), { 类: '当前', 说明: '视频' });
    const r = 规划(保留);
    expect(删的(r)).toEqual(['bbbbbbbbbbbbbbbb']);
    expect(主要理由(r.find((f) => f.指纹 === 'aaaaaaaaaaaaaaaa')!.理由)).toBe('认可');
  });

  it('没有认可记录时同一份就会被删（对照：上一条留下靠的是认可）', () => {
    母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    母版('6-甲', 'cccccccccccccccc', '视频', 7);
    const 保留 = new 保留集();
    加认可(保留, path.join(根, '作品', '作品甲'), 母版目录);
    保留.加(path.join(母版目录('6-甲'), 'cccccccccccccccc.mkv'), { 类: '当前', 说明: '视频' });
    expect(删的(规划(保留))).toEqual(['aaaaaaaaaaaaaaaa']);
  });

  it('认可记录读的是 anim verify accept 写的格式；读不出的整段留着', () => {
    const f = 写('认可/x.toml', 认可文本(认可记录('核对-冒烟', 'd'.repeat(64))));
    expect(读认可指纹(f)).toEqual({ 段: '核对-冒烟', 指纹: 'd'.repeat(64) });
    母版('6-乙', 'aaaaaaaaaaaaaaaa', '视频', 9);
    母版('6-乙', 'bbbbbbbbbbbbbbbb', '视频', 8);
    写('作品/作品甲/认可/darwin-arm64/6-乙.toml', '坏了');
    const 警告: string[] = [];
    const 保留 = new 保留集();
    加认可(保留, path.join(根, '作品', '作品甲'), 母版目录, (s) => 警告.push(s));
    expect(删的(规划(保留))).toEqual([]);
    expect(警告).toHaveLength(1);
  });

  it('交付 manifest 引用的母版、叠层留着（相对数据根和早先的绝对路径都认）', () => {
    母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    const 绝对 = 母版('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8);
    母版('6-甲', 'cccccccccccccccc', '视频', 7);
    母版('6-甲', 'dddddddddddddddd', '视频', 6);
    写('交付/作品甲/1021-1755-第6-7章/manifest.json', JSON.stringify({ 段: [{ 键: '6-甲', 母版: 'cache/母版/作品甲/6-甲/aaaaaaaaaaaaaaaa.mkv' }], 叠层: [{ 键: '6-甲-层', 文件: 'cache/叠层/作品甲/6-甲-层/eeeeeeeeeeeeeeee.mov' }] }));
    写('交付/1020-0000-更早/manifest.json', JSON.stringify({ 段: [{ 键: '6-甲', 母版: 绝对 }] }));
    const 保留 = new 保留集();
    加交付(保留, path.join(根, '交付'), 根);
    expect(删的(规划(保留))).toEqual(['cccccccccccccccc']); // dddd 是最近一份
    expect(保留.查(path.join(根, 'cache', '叠层', '作品甲', '6-甲-层', 'eeeeeeeeeeeeeeee.mov')).map((x) => x.说明)).toEqual(['作品甲/1021-1755-第6-7章']);
    expect(交付引用({ 段: [{ 母版: 'x' }, { 母版: 1 }], 叠层: 'x' })).toEqual(['x']);
    expect(交付引用(null)).toEqual([]);
  });

  it('每个级别留最近一份，近期天数里渲的都留', () => {
    母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    母版('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8); // 视频最近一份
    母版('6-甲', 'cccccccccccccccc', '预览', 9);
    母版('6-甲', 'dddddddddddddddd', '预览', 5); // 预览最近一份
    const r = 规划(new 保留集());
    expect(删的(r)).toEqual(['aaaaaaaaaaaaaaaa', 'cccccccccccccccc']);
    expect(删的(规划(new 保留集(), 10))).toEqual([]);
  });

  it('最近一份按 .指纹.json 的时间排：删完以后 film --允许过期（历史指纹）取的还是原来那份', () => {
    // 迁移时把 aaaa 的母版硬链接到新指纹 bbbb 名下：bbbb.mkv 是旧时间，bbbb.指纹.json 是新的
    const a = 母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9, 100);
    母版('6-甲', 'cccccccccccccccc', '视频', 8, 200);
    const b = path.join(母版目录('6-甲'), 'bbbbbbbbbbbbbbbb.mkv');
    fs.linkSync(a, b);
    写('cache/母版/作品甲/6-甲/bbbbbbbbbbbbbbbb.指纹.json', JSON.stringify({ 段: '6-甲', 指纹: 'b'.repeat(64), 项: { 渲染设置: { inputProps: { 级别: '视频' } } } }), 现在 - 3 * 天);
    const 取 = () => 历史指纹('6-甲', 母版目录('6-甲')).find((h) => fs.existsSync(path.join(母版目录('6-甲'), `${h.指纹.slice(0, 16)}.mkv`)))?.指纹.slice(0, 16);
    expect(取()).toBe('bbbbbbbbbbbbbbbb');
    const r = 规划(new 保留集());
    expect(删的(r)).toEqual(['aaaaaaaaaaaaaaaa', 'cccccccccccccccc']);
    for (const f of r) if (!f.理由.length) fs.rmSync(f.路径);
    expect(取()).toBe('bbbbbbbbbbbbbbbb');
  });

  it('当前指纹算不出的段整个目录留着', () => {
    母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    母版('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8);
    const 保留 = new 保留集();
    保留.加目录(母版目录('6-甲'), { 类: '算不出', 说明: '当前指纹算不出' });
    expect(删的(规划(保留))).toEqual([]);
    // 目录名是前缀的别的段不受影响
    母版('6-甲乙', 'aaaaaaaaaaaaaaaa', '视频', 9);
    母版('6-甲乙', 'bbbbbbbbbbbbbbbb', '视频', 8);
    expect(规划(保留).filter((f) => !f.理由.length).map((f) => f.键)).toEqual(['6-甲乙']);
  });

  it('作品读不出时（不在代码里）母版、叠层整个留着', async () => {
    const 保留 = new 保留集();
    const 警告: string[] = [];
    await 加当前指纹(保留, '没有这部作品', (s) => 警告.push(s));
    expect([...保留.目录.keys()].map((k) => path.basename(path.dirname(k)) + '/' + path.basename(k))).toEqual(['母版/没有这部作品', '叠层/没有这部作品']);
    expect(警告[0]).toMatch(/清单读不出/);
  });

  it('只删媒体文件，.指纹.json 留着；执行前文件又被改过就跳过', async () => {
    const 旧 = 母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    const 刚改 = 母版('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8);
    母版('6-甲', 'cccccccccccccccc', '视频', 7);
    const 计划: 回收计划 = { 媒体: 规划(new 保留集()), 临时: [], 草稿: [], webpack: [], 不认识: [], 去重: null, 警告: [] };
    expect(删的(计划.媒体)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
    fs.utimesSync(刚改, new Date(), new Date());
    const r = await 执行回收(计划, { 近期天数: 2, 草稿天数: 14, webpack天数: 3 });
    expect(r).toMatchObject({ 删数: 1, 删大小: 100, 失败: [] });
    expect(r.跳过).toHaveLength(1);
    expect(fs.existsSync(旧)).toBe(false);
    expect(fs.existsSync(旧.replace(/\.mkv$/, '.指纹.json'))).toBe(true);
    expect(fs.existsSync(刚改)).toBe(true);
  });

  it('硬链接：名字全删了才算腾出空间，留下的同一 inode 只算一次', () => {
    const a = 母版('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    fs.linkSync(a, path.join(母版目录('6-甲'), 'bbbbbbbbbbbbbbbb.mkv'));
    const bjson = path.join(母版目录('6-甲'), 'bbbbbbbbbbbbbbbb.指纹.json');
    fs.copyFileSync(a.replace(/\.mkv$/, '.指纹.json'), bjson);
    fs.utimesSync(bjson, new Date(现在 - 9 * 天), new Date(现在 - 9 * 天));
    母版('6-甲', 'cccccccccccccccc', '视频', 7);
    const 全删 = 小计(规划(new 保留集()).filter((f) => f.指纹 !== 'cccccccccccccccc'));
    expect(全删).toMatchObject({ 删数: 2, 删大小: 100, 硬链接未腾: 0 });
    const 保留 = new 保留集();
    保留.加(a, { 类: '交付', 说明: 'x' });
    const 留一个 = 小计(规划(保留).filter((f) => f.指纹 !== 'cccccccccccccccc'));
    expect(留一个).toMatchObject({ 删数: 1, 删大小: 0, 留数: 1, 留大小: 100 });
    // 另一个名字不在这次计划里（比如在别处）：删了也不腾
    expect(小计(规划(new 保留集()).filter((f) => f.指纹 === 'aaaaaaaaaaaaaaaa'))).toMatchObject({ 删大小: 0, 硬链接未腾: 100 });
  });
});

describe('残留、草稿、webpack', () => {
  it('崩掉留下的临时文件超过 1 天才删', () => {
    expect(是临时名('aaaaaaaaaaaaaaaa.渲染中-123.mkv')).toBe(true);
    expect(是临时名('x.指纹.json.写入中-9')).toBe(true);
    expect(是临时名('aaaaaaaaaaaaaaaa.mkv')).toBe(false);
    const r = 规划临时([{ 路径: 'a', 大小: 1, 改于: 现在 - 2 * 天 }, { 路径: 'b', 大小: 1, 改于: 现在 - 3600_000 }], 现在);
    expect(r.map((x) => x.理由.length)).toEqual([0, 1]);
  });

  it('草稿按目录里最近改动的时间算，超过天数的删', () => {
    写('run/草稿/1001-0000-工作-旧/01.png', 'x', 现在 - 20 * 天);
    写('run/草稿/1028-0000-工作-新/01.png', 'x', 现在 - 2 * 天);
    写('run/草稿/1001-0000-工作-旧但刚加/01.png', 'x', 现在 - 20 * 天);
    写('run/草稿/1001-0000-工作-旧但刚加/02.png', 'x', 现在 - 1 * 天);
    // 目录自己的修改时间是刚建的，拨回去，只看里面的文件
    for (const e of 列目录(path.join(根, 'run', '草稿'))) fs.utimesSync(e.路径, new Date(现在 - 30 * 天), new Date(现在 - 30 * 天));
    const r = 规划草稿(列目录(path.join(根, 'run', '草稿')), { 现在, 天数: 14 });
    expect(r.filter((x) => !x.理由.length).map((x) => x.名)).toEqual(['1001-0000-工作-旧']);
  });

  it('不认识的条目只列出来（带大小），认识的不列', () => {
    写('run/草稿/a/01.png', 'xx');
    写('run/会话交接-1024/b.bin', 'xxxx');
    写('run/零散.txt', 'x');
    expect(不认识条目(path.join(根, 'run'), ['草稿']).map((e) => [e.名, e.大小]).sort()).toEqual([['会话交接-1024', 4], ['零散.txt', 1]]);
    expect(不认识条目(path.join(根, '没有'), [])).toEqual([]);
  });

  it('webpack：旧 Remotion 版本整个删；同版本每个环境留最近 N 份，其余超过天数的删；认不得的只报告', () => {
    const wp = path.join(根, 'webpack');
    写('webpack/remotion-production-4.0.530/h1/0.pack', 'x', 现在 - 9 * 天);
    写('webpack/remotion-production-4.0.537/h2/0.pack', 'x', 现在 - 9 * 天);
    写('webpack/remotion-production-4.0.537/h3/0.pack', 'x', 现在 - 6 * 天);
    写('webpack/remotion-production-4.0.537/h4/0.pack', 'x', 现在 - 5 * 天);
    写('webpack/remotion-production-4.0.537/h5/0.pack', 'x', 现在 - 1 * 天);
    写('webpack/remotion-development-4.0.537/h6/0.pack', 'x', 现在 - 30 * 天);
    写('webpack/别的东西/x', 'x');
    const 扫 = 扫webpack(wp, '4.0.537');
    expect(扫.不认识.map((e) => e.名)).toEqual(['别的东西']);
    const 删 = (n: number) => 规划webpack(扫.条目, { 当前版本: '4.0.537', 现在, 天数: 3, 每环境留: n }).filter((e) => !e.理由.length).map((e) => e.名).sort();
    expect(删(1)).toEqual(['remotion-production-4.0.530', 'remotion-production-4.0.537/h2', 'remotion-production-4.0.537/h3', 'remotion-production-4.0.537/h4']);
    expect(删(2)).toEqual(['remotion-production-4.0.530', 'remotion-production-4.0.537/h2', 'remotion-production-4.0.537/h3']);
    // 不知道装的版本：不按版本删，各版本各留最近的
    const 不知 = 规划webpack(扫webpack(wp, null).条目, { 当前版本: null, 现在, 天数: 3 });
    expect(不知.filter((e) => !e.理由.length).map((e) => e.名).sort()).toEqual(['remotion-production-4.0.537/h2', 'remotion-production-4.0.537/h3', 'remotion-production-4.0.537/h4']);
  });
});
