import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listWorks, parseWorkArg, splitFullName, pickWork } from './作品.ts';
import { deliveryRoot, masterDir } from './作品数据.ts';
import { readConfig } from './配置.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-作品-'));
const makeFixture = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '清单.ts'), 'export const 清单 = [];\n');
  return dir;
};
const repoRoot = path.join(tempDir, '仓库');
const firstWork = makeFixture(path.join(repoRoot, '作品', '甲'));
const secondWork = makeFixture(path.join(repoRoot, '作品', '乙'));
fs.mkdirSync(path.join(repoRoot, '作品', '没清单'), { recursive: true });
const outsideDir = makeFixture(path.join(tempDir, '外面', '私有丙'));
afterAll(() => fs.rmSync(tempDir, { recursive: true }));

describe('作品们', () => {
  it('作品/ 下有 清单.ts 的目录，加上 [works] 登记的外部目录', () => {
    expect(Object.fromEntries(listWorks(repoRoot, { 丙: outsideDir }))).toEqual({ 甲: firstWork, 乙: secondWork, 丙: outsideDir });
  });
  it('登记的目录没有 清单.ts 报错；名字只差大小写报错', () => {
    expect(() => listWorks(repoRoot, { 丁: path.join(tempDir, '外面') })).toThrow(/没有 清单.ts/);
    const caseDir = path.join(tempDir, '大小写');
    makeFixture(path.join(caseDir, '作品', 'ab'));
    expect(() => listWorks(caseDir, { AB: outsideDir })).toThrow(/只差大小写/);
  });
  it('[works] 读进 读配置，相对路径相对 toml', () => {
    const toml = path.join(tempDir, 'anim.local.toml');
    fs.writeFileSync(toml, 'work = "甲"\n\n[works]\n"私有丙" = "外面/私有丙"\n');
    const r = readConfig({}, toml);
    expect(r.workPaths).toEqual({ 私有丙: outsideDir });
    expect(r.value.默认作品!.value).toBe('甲');
  });
});

describe('选作品', () => {
  const workRoots = new Map([
    ['甲', firstWork],
    ['乙', secondWork],
    ['丙', outsideDir],
  ]);
  it('--work > 当前目录 > 默认作品', () => {
    expect(pickWork({ params: '乙', cwd: firstWork, 默认: '丙', 们: workRoots }).name).toBe('乙');
    expect(pickWork({ cwd: path.join(firstWork, '段'), 默认: '丙', 们: workRoots }).name).toBe('甲');
    expect(pickWork({ cwd: outsideDir, 默认: '甲', 们: workRoots }).name).toBe('丙');
    expect(pickWork({ cwd: tempDir, 默认: '丙', 们: workRoots }).name).toBe('丙');
  });
  it('只有一部就用它；多部又定不了就报错并列出名字', () => {
    expect(pickWork({ cwd: tempDir, 们: new Map([['甲', firstWork]]) }).name).toBe('甲');
    expect(() => pickWork({ cwd: tempDir, 们: workRoots })).toThrow(/甲、乙、丙/);
    expect(() => pickWork({ params: '戊', 们: workRoots })).toThrow(/没有作品「戊」/);
  });
  it('--work 从参数里取走，-- 之后的不动', () => {
    expect(parseWorkArg(['render', '--work', '甲', '7-甲'])).toEqual({ work: '甲', rest: ['render', '7-甲'] });
    expect(parseWorkArg(['--work=乙', 'stale'])).toEqual({ work: '乙', rest: ['stale'] });
    expect(parseWorkArg(['studio', '--', '--work', 'x'])).toEqual({ rest: ['studio', '--', '--work', 'x'] });
    expect(() => parseWorkArg(['--work'])).toThrow(/后面要跟作品名/);
  });
  it('段全名 作品/段键', () => {
    expect(splitFullName('乙/7-甲')).toEqual({ work: '乙', key: '7-甲' });
    expect(splitFullName('7-甲')).toEqual({ key: '7-甲' });
  });
});

describe('按作品分的缓存和交付', () => {
  it('同名段在不同作品下的母版、交付目录不同', () => {
    expect(masterDir('7-甲', '甲')).not.toBe(masterDir('7-甲', '乙'));
    expect(masterDir('7-甲', '甲').split(path.sep).slice(-3)).toEqual(['母版', '甲', '7-甲']);
    expect(deliveryRoot('甲')).not.toBe(deliveryRoot('乙'));
  });
});
