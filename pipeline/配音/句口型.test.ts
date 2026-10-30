// 新旧两条路动出来的嘴一样：应力转动的句模块走 库/角色/句口型.ts，旧表走 作品/应力转动/配音/口型.ts 的 做口型；数据根里没有旧表的字节就跳过。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 做口型 } from '../../库/角色/口型.ts';
import { 句口型, 句点头 } from '../../库/角色/句口型.ts';
import { 代码根 } from '../环境/路径.ts';
import { 读旧配音表 } from '../适配器/旧项目/配音表.ts';
import { 字节路径, 读资产锁, 资产锁路径 } from '../资产/资产锁.ts';
import { 列句模块, 句模块路径, 读句模块 } from './句模块.ts';

const 根 = path.join(代码根(), '作品', '应力转动');
const 锁 = 读资产锁(资产锁路径());
const 有旧表 = ['数据/配音/台词表', '数据/配音/口型'].every((id) => 锁[id] && fs.existsSync(字节路径(锁[id]!)));

describe.skipIf(!有旧表 || !列句模块(根).length)('句口型和旧 做口型 逐帧一样', () => {
  it('应力转动 32 句：嘴的开合宽窄、点头', () => {
    const 旧表 = 读旧配音表(根, 锁);
    const 口型表: Record<string, unknown> = {};
    const 台词表: Record<string, unknown> = {};
    for (const v of 旧表.values()) {
      口型表[v.旧id] = v.口型;
      台词表[v.旧id] = v.台词;
    }
    const 旧 = 做口型(口型表, 台词表);
    let 比了 = 0;
    for (const id of 列句模块(根)) {
      const 句 = 读句模块(句模块路径(根, id))!;
      const 旧id = 旧表.get(id)!.旧id;
      const 帧 = 12.5;
      for (let f = 0; f < 帧 + Math.ceil(句.文件秒数 * 24) + 12; f++) {
        expect(句口型([{ 句, 帧 }], 句.角色, f)).toEqual(旧.mouthAt([{ id: 旧id, 帧 }], 句.角色, f));
        const 姿 = { headPitch: 0.1, headYaw: -0.2 };
        expect(句点头(姿, [{ 句, 帧 }], 句.角色, f)).toEqual(旧.withTalkNod(姿, [{ id: 旧id, 帧 }], 句.角色, f));
        比了++;
      }
      expect(句口型([{ 句, 帧 }], '别人', 帧 + 5)).toBeUndefined();
    }
    expect(比了).toBeGreaterThan(1000);
  });
});
