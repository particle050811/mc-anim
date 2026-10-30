// 姿态程序求值器：拿 py/tests/动作翻译样例/ 的 SampleModel 翻出的程序，在 JVM 跑出的真值上逐位对照（夹具由 py/tests/test_动作翻译.py 生成），
// 再用手写的小程序验几处 JVM 语义（按位与 / 逻辑与、long、枚举输入、默认值、visible）。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EntityPart } from '../model/实体模型.tsx';
import { 内建函数, 动画状态, 求部件姿态, 姿态求值器, 节点求值器, type 姿态程序 } from './姿态程序.ts';

const 位转浮 = (h: string) => {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, parseInt(h, 16));
  return dv.getFloat32(0);
};
const 浮转位 = (x: number) => {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, x);
  return dv.getUint32(0).toString(16);
};

type 样例文件 = { 程序: 姿态程序; 根: EntityPart; 样例: { 输入: Record<string, string | number>; 真值: Record<string, string> }[] };
const 夹具 = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '姿态程序.样例.json'), 'utf8')) as 样例文件;
const 浮点输入 = new Set(['limbSwing', 'limbSwingAmount', 'ageInTicks', 'netHeadYaw', 'headPitch', 'partialTick', 'entity.getHealth()', 'model.attackTime']);

describe('姿态程序求值器', () => {
  it(`样例模型 ${夹具.样例.length} 组输入（含 NaN、±0、无穷、超出 int 的大数）和 JVM 逐位相同`, () => {
    const 求 = 姿态求值器(夹具.程序, 夹具.根);
    for (const { 输入, 真值 } of 夹具.样例) {
      const 给 = Object.fromEntries(Object.entries(输入).map(([k, v]) => [k, 浮点输入.has(k) ? 位转浮(v as string) : (v as number)]));
      const { 姿态, 隐藏 } = 求(给);
      for (const [部件, 串] of Object.entries(真值)) {
        const p = 姿态[部件];
        const 算 = [...p.offset, ...p.rot, ...p.scale].map(浮转位).join(' ') + ` ${隐藏.includes(部件) ? 0 : 1}`;
        expect(算, `${部件}，输入 ${JSON.stringify(输入)}`).toBe(串);
      }
    }
  });

  const 根: EntityPart = { name: 'root', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [], children: [{ name: 'a', pose: { offset: [1, 2, 3], rot: [0, 0, 0.5] }, cubes: [], children: [] }] };
  const 程序 = (节点: 姿态程序['节点'], 输出: 姿态程序['输出'], 输入: 姿态程序['输入'] = {}): 姿态程序 => ({ 格式: '姿态程序/1', 模型类: 'x', 方法: [], 复位: false, 输入, 固定: {}, 节点, 输出, 警告: [] });

  it('i 的 and / or 是按位的，z 的是逻辑的', () => {
    const p = 程序(
      [['in', 'i', 'n'], ['c', 'i', 6], ['and', 'i', 0, 1], ['or', 'i', 0, 1], ['!=', 'z', 0, 1], ['==', 'z', 2, 1], ['and', 'z', 4, 5], ['or', 'z', 4, 5]],
      {},
      { n: { 类型: 'i', 来源: '参数' } },
    );
    const v = 节点求值器(p, 根)({ n: 3 });
    expect(v.slice(2)).toEqual([2, 7, true, false, false, true]);
  });

  it('long 常量（超出 2^53 的写成串）、long 回绕、float 每步舍入、(int) 强转饱和', () => {
    const p = 程序(
      [['c', 'j', '9007199254740993'], ['c', 'j', '9223372036854775807'], ['c', 'j', 1], ['+', 'j', 1, 2], ['c', 'f', 0.1], ['*', 'f', 4, 4], ['c', 'f', 'Infinity'], ['conv', 'i', 6], ['c', 'f', 'NaN'], ['conv', 'i', 8]],
      {},
    );
    const v = 节点求值器(p, 根)({});
    expect(v[0]).toBe(9007199254740993n);
    expect(v[3]).toBe(-9223372036854775808n);
    expect(v[5]).toBe(Math.fround(Math.fround(0.1) * Math.fround(0.1)));
    expect(v[7]).toBe(2147483647);
    expect(v[9]).toBe(0);
  });

  it('枚举给常量名、没给的输入取默认；写到的字段落到姿态上，visible = 0 的部件隐藏', () => {
    const p = 程序(
      [['in', 'i', 'mode'], ['c', 'i', 2], ['==', 'z', 0, 1], ['rest', 'f', 'a', 'zRot'], ['c', 'f', 0.25], ['sel', 'f', 2, 4, 3], ['in', 'f', 'k'], ['in', 'i', 'show']],
      { a: { zRot: 5, x: 6, visible: 7 } },
      { mode: { 类型: 'i', 来源: '实体', 枚举: ['A', 'B', 'C'] }, k: { 类型: 'f', 来源: '模型字段', 默认: 1.5 }, show: { 类型: 'i', 来源: '实体', 默认: 1 } },
    );
    const 求 = 姿态求值器(p, 根);
    expect(求({ mode: 'C' }).姿态.a.rot[2]).toBe(0.25);
    expect(求({ mode: 'A' }).姿态.a.rot[2]).toBe(Math.fround(0.5));
    expect(求({ mode: 'A' }).姿态.a.offset).toEqual([1.5, 2, 3]);
    expect(() => 求({ mode: 'D' })).toThrow(/不在枚举/);
    expect(求({ show: false }).隐藏).toEqual(['a']);
    expect(求部件姿态(p, 根, { show: false }).a.hide).toBe(true);
    expect(求部件姿态(p, 根, {}).a.hide).toBeUndefined();
  });

  it('内建函数逐个对 JVM 真值（夹具 姿态程序.内建样例.json；java/lang/Math 的超越函数按 1 ulp 比，JDK 本身只保证这么多）', () => {
    const 内建夹具 = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '姿态程序.内建样例.json'), 'utf8')) as {
      超越函数: string[];
      样例: [string, string[], string][];
    };
    const 读 = (t: string, s: string) => {
      if (t === 'F') return 位转浮(s);
      if (t === 'I') return Number(s);
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + s));
      return dv.getFloat64(0);
    };
    const 写 = (t: string, x: number) => {
      if (t === 'I') return String(x);
      if (Number.isNaN(x)) return t === 'F' ? '7fc00000' : '7ff8000000000000';
      if (t === 'F') return 浮转位(x);
      const dv = new DataView(new ArrayBuffer(8));
      dv.setFloat64(0, x);
      return dv.getBigUint64(0).toString(16);
    };
    const 函数们 = new Set<string>();
    for (const [函数, 参数, 真值] of 内建夹具.样例) {
      函数们.add(函数);
      const 描述 = 函数.slice(函数.indexOf('('));
      const 参数类型 = 描述.slice(1, 描述.indexOf(')'));
      const 返回类型 = 描述.slice(描述.indexOf(')') + 1);
      const 算 = 内建函数[函数](...参数.map((a, i) => 读(参数类型[i], a)));
      if (内建夹具.超越函数.includes(函数) && 写(返回类型, 算) !== 真值) {
        const 真 = 读('D', 真值);
        expect(Math.abs(算 - 真), `${函数}(${参数.join(', ')})`).toBeLessThanOrEqual(Math.abs(真) * 2 ** -52);
      } else expect(写(返回类型, 算), `${函数}(${参数.join(', ')})`).toBe(真值);
    }
    // 夹具和 内建函数 一一对应（py/anim_py/动作翻译/图.py 加了函数，这边也要加）
    expect([...函数们].sort()).toEqual(Object.keys(内建函数).sort());
  });

  it('程序要的内建函数、部件不在时编译就报错', () => {
    expect(() => 节点求值器(程序([['call', 'f', 'x/Y.z(F)F']], {}), 根)).toThrow(/没实现的内建函数/);
    expect(() => 节点求值器(程序([['rest', 'f', 'b', 'x']], {}), 根)).toThrow(/模型里没有/);
  });

  it('long 输入收 bigint、十进制串（Long.MAX_VALUE 默认值）；动画状态 给出没开始 / 第几刻开始', () => {
    const p = 程序([['in', 'j', 's.lastTime'], ['in', 'j', 's.accumulatedTime'], ['c', 'j', 1], ['+', 'j', 0, 2]], {}, { 's.lastTime': { 类型: 'j', 来源: '实体', 默认: '9223372036854775807' }, 's.accumulatedTime': { 类型: 'j', 来源: '实体' } });
    const 求 = 节点求值器(p, 根);
    expect(求({}).slice(0, 2)).toEqual([9223372036854775807n, 0n]);
    expect(求({}).at(-1)).toBe(-9223372036854775808n);
    expect(求(动画状态('s', 30)).slice(0, 2)).toEqual([1500n, 0n]);
    expect(求(动画状态('s')).slice(0, 2)).toEqual([9223372036854775807n, 0n]);
    expect(求({ 's.lastTime': '123' })[0]).toBe(123n);
  });

  it('rotlerpRad：差归到 [-π, π)；差大到加减 2π 不动（JVM 里死循环）给 NaN', () => {
    const f = 内建函数['net/minecraft/client/model/ModelUtils.rotlerpRad(FFF)F'];
    expect(f(0, 7, 1)).toBe(Math.fround(Math.fround(7) - Math.fround(Math.PI * 2)));
    expect(f(0, 1e10, 0.5)).toBeNaN();
    expect(f(0, Infinity, 0.5)).toBeNaN();
  });
});
