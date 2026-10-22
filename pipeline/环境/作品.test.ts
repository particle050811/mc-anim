import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { 作品们, 取作品参数, 拆全名, 选作品 } from './作品.ts';
import { 交付根, 母版目录, 叠层目录, 读配置 } from './配置.ts';

const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-作品-'));
const 造 = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '清单.ts'), 'export const 清单 = [];\n');
  return dir;
};
const 仓库 = path.join(临时, '仓库');
const 甲 = 造(path.join(仓库, '作品', '甲'));
const 乙 = 造(path.join(仓库, '作品', '乙'));
fs.mkdirSync(path.join(仓库, '作品', '没清单'), { recursive: true });
const 外部 = 造(path.join(临时, '外面', '私有丙'));
afterAll(() => fs.rmSync(临时, { recursive: true }));

describe('作品们', () => {
  it('作品/ 下有 清单.ts 的目录，加上 [works] 登记的外部目录', () => {
    expect(Object.fromEntries(作品们(仓库, { 丙: 外部 }))).toEqual({ 甲, 乙, 丙: 外部 });
  });
  it('登记的目录没有 清单.ts 报错；名字只差大小写报错', () => {
    expect(() => 作品们(仓库, { 丁: path.join(临时, '外面') })).toThrow(/没有 清单.ts/);
    const 大小写 = path.join(临时, '大小写');
    造(path.join(大小写, '作品', 'ab'));
    expect(() => 作品们(大小写, { AB: 外部 })).toThrow(/只差大小写/);
  });
  it('[works] 读进 读配置，相对路径相对 toml', () => {
    const toml = path.join(临时, 'anim.local.toml');
    fs.writeFileSync(toml, 'work = "甲"\n\n[works]\n"私有丙" = "外面/私有丙"\n');
    const r = 读配置({}, toml);
    expect(r.作品路径).toEqual({ 私有丙: 外部 });
    expect(r.值.默认作品!.值).toBe('甲');
  });
});

describe('选作品', () => {
  const 们 = new Map([
    ['甲', 甲],
    ['乙', 乙],
    ['丙', 外部],
  ]);
  it('--作品 > 当前目录 > 默认作品', () => {
    expect(选作品({ 参数: '乙', cwd: 甲, 默认: '丙', 们 }).名).toBe('乙');
    expect(选作品({ cwd: path.join(甲, '段'), 默认: '丙', 们 }).名).toBe('甲');
    expect(选作品({ cwd: 外部, 默认: '甲', 们 }).名).toBe('丙');
    expect(选作品({ cwd: 临时, 默认: '丙', 们 }).名).toBe('丙');
  });
  it('只有一部就用它；多部又定不了就报错并列出名字', () => {
    expect(选作品({ cwd: 临时, 们: new Map([['甲', 甲]]) }).名).toBe('甲');
    expect(() => 选作品({ cwd: 临时, 们 })).toThrow(/甲、乙、丙/);
    expect(() => 选作品({ 参数: '戊', 们 })).toThrow(/没有作品「戊」/);
  });
  it('--作品 从参数里取走，-- 之后的不动', () => {
    expect(取作品参数(['render', '--作品', '甲', '7-甲'])).toEqual({ 作品: '甲', 其余: ['render', '7-甲'] });
    expect(取作品参数(['--作品=乙', 'stale'])).toEqual({ 作品: '乙', 其余: ['stale'] });
    expect(取作品参数(['studio', '--', '--作品', 'x'])).toEqual({ 其余: ['studio', '--', '--作品', 'x'] });
    expect(() => 取作品参数(['--作品'])).toThrow(/后面要跟作品名/);
  });
  it('段全名 作品/段键', () => {
    expect(拆全名('乙/7-甲')).toEqual({ 作品: '乙', 键: '7-甲' });
    expect(拆全名('7-甲')).toEqual({ 键: '7-甲' });
  });
});

describe('按作品分的缓存和交付', () => {
  it('同名段在不同作品下的母版、叠层、交付目录不同', () => {
    expect(母版目录('7-甲', '甲')).not.toBe(母版目录('7-甲', '乙'));
    expect(母版目录('7-甲', '甲').split(path.sep).slice(-3)).toEqual(['母版', '甲', '7-甲']);
    expect(叠层目录('7-甲-层', '甲')).not.toBe(叠层目录('7-甲-层', '乙'));
    expect(交付根('甲')).not.toBe(交付根('乙'));
  });
});
