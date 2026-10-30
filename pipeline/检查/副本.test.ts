import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 基础, 跑, 造仓库, type 文件表 } from './测试夹具.ts';
import { 读副本表 } from './规则/副本.ts';

const 真 = (p: string) => fs.readFileSync(path.join(代码根(), ...p.split('/')), 'utf8');
/** 正本（行为认法要执行 数学.ts、坐标.ts）；样例仓库里没有 node_modules，给一个只有 Vector3 的 three */
const 正本 = (): 文件表 => ({
  'engine/core/数学.ts': 真('engine/core/数学.ts'),
  'engine/core/坐标.ts': 真('engine/core/坐标.ts'),
  'node_modules/three/package.json': '{ "name": "three", "type": "module", "main": "index.js" }',
  'node_modules/three/index.js': 'export class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }\n',
});
const 表 = (...行: string[]) => ({ 'docs/副本表.tsv': ['# 测试', '正本\t文件\t处数', ...行].join('\n') + '\n' });
const 旧段 = {
  '作品/应力转动/段/7-甲/编排.ts': 'export const ss = (t: number) => t * t * (3 - 2 * t);\nexport const 插 = (a: number, b: number, k: number) => a * (1 - k) + b * k;\n',
};

describe('副本', () => {
  it('合规：旧副本都登记了、新代码 import 正本、同名但行为不同的函数不算', async () => {
    const 根 = 造仓库(基础(), 正本(), 旧段, 表('lerp\t作品/应力转动/段/7-甲/编排.ts\t1', 'smoothstep01\t作品/应力转动/段/7-甲/编排.ts\t1', 'lerp\t作品/别的/段/x/编排.ts\t3'), {
      '库/新/工具.ts': "import { lerp, smoothstep01 } from '@engine/core/数学.ts';\nexport const 走 = (t: number) => lerp(0, 10, smoothstep01(t));\n",
      '库/新/别的.ts': 'export const lerp = (a: number, b: number, t: number) => a * t + b;\nexport function clamp(v: number, lo: number, hi: number) { return (v | 0) + lo * hi; }\n',
    });
    const { 违规, 报 } = await 跑('副本', 根);
    expect(违规, 违规.join('\n')).toEqual([]);
    expect(报.信息.join('\n')).toMatch(/登记 2 处旧副本/);
  });

  it('新写的副本：改名、换写法、记号都认得出，提示 import 哪个正本', async () => {
    const 根 = 造仓库(基础(), 正本(), 旧段, 表('lerp\t作品/应力转动/段/7-甲/编排.ts\t1', 'smoothstep01\t作品/应力转动/段/7-甲/编排.ts\t1'), {
      '作品/应力转动/段/7-甲/新.ts': [
        'export const 平滑 = (x: number) => { const y = x; return y * y * (3 - 2 * y); };',
        "import * as THREE from 'three';",
        'export const 转 = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);',
        'export type 镜 = { pos: number[]; tgt: number[]; lens: number };',
        'export const 视角 = (lens: number, a: number) => (2 * Math.atan(18 / lens / a) * 180) / Math.PI;',
        'export const 掉 = (n: number) => { let v = 0, y = 0; for (let i = 0; i < n; i++) { y += v; v = (v - 0.08) * 0.98; } return y; };',
        'export const 随 = (s: number) => () => { s = (s + 0x6d2b79f5) | 0; return s; };',
        'export const lerpCam = (a: any, b: any, k: number) => ({ ...a, k, b });',
        '',
      ].join('\n'),
    });
    const v = (await 跑('副本', 根)).违规.join('\n');
    expect(v).toMatch(/新.ts:1 smoothstep01 的副本有 1 处（第 1 行 平滑（行为））.*import \{ smoothstep01 \} from '@engine\/core\/数学.ts'/);
    expect(v).toMatch(/新.ts:3 场景到three 的副本有 1 处（第 3 行 转（行为））/);
    expect(v).toMatch(/新.ts:4 Cam 的副本/);
    expect(v).toMatch(/新.ts:5 焦距到视角 的副本有 1 处（第 5 行 视角（记号））/);
    expect(v).toMatch(/新.ts:6 原版下落 的副本有 1 处（第 6 行 掉（记号））.*import \{ 下落一刻 \} from '@库\/原版物理.ts'/);
    expect(v).toMatch(/新.ts:7 mulberry32 的副本/);
    expect(v).toMatch(/新.ts:8 插机位 的副本有 1 处（第 8 行 lerpCam（名字））/);
    // 同一个文件里比登记的多一处
    expect(v).not.toMatch(/编排.ts/);
  });

  it('副本少了、文件没了、表里的数加大了、正本表里没有的 id：都要改表', async () => {
    const 根 = 造仓库(基础(), 正本(), 旧段, 表(
      'lerp\t作品/应力转动/段/7-甲/编排.ts\t2',
      'smoothstep01\t作品/应力转动/段/7-甲/编排.ts\t1',
      'clamp01\t库/没了.ts\t1',
      '没这个\t库/x.ts\t1',
      'mod\t库/x.ts\t0',
    ));
    const v = (await 跑('副本', 根)).违规.join('\n');
    expect(v).toMatch(/7-甲\/编排.ts lerp 的副本现在 1 处，副本表登记 2 处：把 docs\/副本表.tsv 这一行改成 1/);
    expect(v).toMatch(/副本表登记 clamp01 在 库\/没了.ts 有 1 处，现在文件都没了：删掉这一行/);
    expect(v).toMatch(/正本表里没有 没这个/);
    expect(v).toMatch(/第 7 行：要三列，处数是正整数/);
  });

  it('没有副本表报错；表头不对报错', async () => {
    expect((await 跑('副本', 造仓库(基础(), 正本()))).违规.join('\n')).toMatch(/没有 docs\/副本表.tsv/);
    expect(读副本表('正本\t文件\n').错).toEqual(['第 1 行：表头应是「正本<TAB>文件<TAB>处数」']);
  });

  it('表和 main 的分叉点比：总处数只许减少，挪文件不加总数可以', async () => {
    const 根 = 造仓库(基础(), 正本(), 旧段, 表('lerp\t作品/应力转动/段/7-甲/编排.ts\t1', 'smoothstep01\t作品/应力转动/段/7-甲/编排.ts\t1'));
    const git = (...a: string[]) => execFileSync('git', ['-C', 根, '-c', 'user.name=测试', '-c', 'user.email=t@t', ...a], { stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(根, '.gitignore'), 'node_modules/\n');
    git('add', '-A');
    git('commit', '-q', '-m', '基线');
    git('checkout', '-q', '-b', '分支');
    // 多写一份 smoothstep01 并登记进表：表比 main 上多了一处
    fs.mkdirSync(path.join(根, '库'), { recursive: true });
    fs.writeFileSync(path.join(根, '库', '多.ts'), 'export const 缓 = (t: number) => t * t * (3 - 2 * t);\n');
    fs.appendFileSync(path.join(根, 'docs', '副本表.tsv'), 'smoothstep01\t库/多.ts\t1\n');
    const v = (await 跑('副本', 根)).违规.join('\n');
    expect(v).toMatch(/副本表里 smoothstep01 从 1 处加到 2 处：表只许减少/);
    expect(v).not.toMatch(/lerp/);
  });
});
