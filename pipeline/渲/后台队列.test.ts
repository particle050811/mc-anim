// 后台转存队列：先排先做、一次一个、排满了让下一段等、一项失败不连累后面、等齐才算完。
import { describe, expect, it } from 'vitest';
import { 建后台队列 } from './后台队列.ts';

/** 手动放行的一项：调 开 才算做完 */
const 手动 = () => {
  let 开!: () => void;
  let 败!: (e: Error) => void;
  const 完 = new Promise<void>((res, rej) => {
    开 = res;
    败 = rej;
  });
  return { 完, 开: () => 开(), 败: (e: Error) => 败(e) };
};
const 过一拍 = () => new Promise((r) => setTimeout(r, 5));
const 完了吗 = (p: Promise<unknown>) => {
  const 态 = { 完: false };
  void p.then(() => (态.完 = true));
  return 态;
};

describe('后台队列', () => {
  it('一个工作者，先排先做', async () => {
    const q = 建后台队列({ 上限: 10 });
    const 次序: string[] = [];
    const 项们 = ['甲', '乙', '丙'].map((名) => ({ 名, 手: 手动() }));
    for (const x of 项们) q.排({ 名: x.名, 做: async () => (次序.push(x.名), await x.手.完) });
    await 过一拍();
    expect(次序).toEqual(['甲']);
    expect(q.现状()).toEqual({ 在做: '甲', 排着: ['乙', '丙'] });
    项们[0]!.手.开();
    await 过一拍();
    expect(次序).toEqual(['甲', '乙']);
    项们[1]!.手.开();
    项们[2]!.手.开();
    await q.等齐();
    expect(次序).toEqual(['甲', '乙', '丙']);
    expect(q.现状()).toEqual({ 在做: null, 排着: [] });
  });

  it('排着的到上限才让等，在做的那段不算；腾出位子就放', async () => {
    const q = 建后台队列({ 上限: 2 });
    const 手们 = [手动(), 手动(), 手动(), 手动()];
    q.排({ 名: '零', 做: () => 手们[0]!.完 });
    q.排({ 名: '一', 做: () => 手们[1]!.完 });
    await q.等空位();
    q.排({ 名: '二', 做: () => 手们[2]!.完 });
    const 等 = 完了吗(q.等空位());
    await 过一拍();
    expect(等.完).toBe(false);
    手们[0]!.开();
    await 过一拍();
    expect(q.现状()).toEqual({ 在做: '一', 排着: ['二'] });
    expect(等.完).toBe(true);
    手们[1]!.开();
    手们[2]!.开();
    await q.等齐();
  });

  it('一项失败只报给 出错，后面照做', async () => {
    const 错们: string[] = [];
    const q = 建后台队列({ 出错: (名, e) => 错们.push(`${名}:${(e as Error).message}`) });
    const 做了: string[] = [];
    q.排({ 名: '甲', 做: async () => { throw new Error('坏了'); } });
    q.排({ 名: '乙', 做: async () => void 做了.push('乙') });
    await q.等齐();
    expect(错们).toEqual(['甲:坏了']);
    expect(做了).toEqual(['乙']);
  });

  it('同步抛的错也接得住', async () => {
    const 错们: string[] = [];
    const q = 建后台队列({ 出错: (名) => 错们.push(名) });
    q.排({ 名: '甲', 做: () => { throw new Error('同步'); } });
    await q.等齐();
    expect(错们).toEqual(['甲']);
  });

  it('等齐要等到在做和排着的都完；空队列马上返回', async () => {
    const q = 建后台队列();
    await q.等齐();
    const a = 手动();
    const b = 手动();
    q.排({ 名: '甲', 做: () => a.完 });
    q.排({ 名: '乙', 做: () => b.完 });
    const 齐 = 完了吗(q.等齐());
    a.开();
    await 过一拍();
    expect(齐.完).toBe(false);
    b.开();
    await 过一拍();
    expect(齐.完).toBe(true);
  });

  it('等齐的时候又排进来的也要等', async () => {
    const q = 建后台队列();
    const a = 手动();
    const b = 手动();
    q.排({ 名: '甲', 做: () => a.完 });
    const 齐 = 完了吗(q.等齐());
    q.排({ 名: '乙', 做: () => b.完 });
    a.开();
    await 过一拍();
    expect(齐.完).toBe(false);
    b.开();
    await 过一拍();
    expect(齐.完).toBe(true);
  });
});
