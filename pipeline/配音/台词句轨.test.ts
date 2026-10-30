// 台词句轨交给 做台词轨 的表和 cue，和旧 台词轨.tsx 从旧台词表拿到的一样（放法本身都在 做台词轨 里，同一份代码）：
// 把 做台词轨 换成记录参数的假货，逐句比开口、时长、有声长、角色和 cue；数据根里没有旧表的字节就跳过。
import fs from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 读旧配音表 } from '../适配器/旧项目/配音表.ts';
import { 字节路径, 读资产锁, 资产锁路径 } from '../资产/资产锁.ts';
import { 列句模块, 句模块路径, 读句模块 } from './句模块.ts';

type 表项 = { 角色: string; 文件: string; 时长: number; 开口: number; 有声长: number };
const 记 = vi.hoisted(() => ({ 表: {} as Record<string, unknown>, 声音: {} as Record<string, string>, 句们: [] as unknown[] }));
vi.mock('../../engine/audio/台词轨.tsx', () => ({
  做台词轨: (表: Record<string, unknown>, 声音: Record<string, string>) => {
    记.表 = 表;
    记.声音 = 声音;
    return { LineTrack: (p: { 句们: unknown[] }) => ((记.句们 = p.句们), null) };
  },
}));
const { 台词句轨 } = await import('../../engine/audio/台词句轨.tsx');
// 项目没装 @types/react-dom：按变量名引，类型自己写
const 服务端 = 'react-dom/server';
const { renderToStaticMarkup } = (await import(服务端)) as { renderToStaticMarkup: (el: ReactElement) => string };

const 根 = path.join(代码根(), '作品', '应力转动');
const 锁 = 读资产锁(资产锁路径());
const 有旧表 = ['数据/配音/台词表', '数据/配音/口型'].every((id) => 锁[id] && fs.existsSync(字节路径(锁[id]!)));

describe('台词句轨', () => {
  it('没给某句的声音就报错', () => {
    const 句 = { id: '7-李樱-溜了', 角色: '李樱', 念: '溜了', 配音: '配音/7-李樱-溜了', 成品sha: 'a'.repeat(12), 开口: 0, 有声长: 1, 时长: 1, 文件秒数: 1, 字: [], 嘴: [] };
    expect(() => renderToStaticMarkup(createElement(台词句轨, { 句们: [{ 句, 帧: 0 }], 声音: {} }))).toThrow(/没给 7-李樱-溜了 的声音/);
  });

  it.skipIf(!有旧表 || !列句模块(根).length)('应力转动 32 句：交给 做台词轨 的开口、时长、有声长、角色、cue 和旧表一样', () => {
    const 旧表 = 读旧配音表(根, 锁);
    for (const id of 列句模块(根)) {
      const 句 = 读句模块(句模块路径(根, id))!;
      const 旧 = 旧表.get(id)!.台词;
      renderToStaticMarkup(createElement(台词句轨, { 句们: [{ 句, 帧: 12.5 }, { 句, 帧: 40, 音量: 0.5 }], 声音: { [id]: `blob:${id}` } }));
      const 项 = 记.表[id] as 表项;
      expect([项.角色, 项.开口, 项.时长, 项.有声长]).toEqual([旧.角色, 旧.开口, 旧.时长, 旧.有声长]);
      expect(记.声音[项.文件]).toBe(`blob:${id}`);
      expect(记.句们).toEqual([{ id, 帧: 12.5 }, { id, 帧: 40, 音量: 0.5 }]);
    }
  });
});
