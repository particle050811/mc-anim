import { describe, expect, it, vi } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/2-收集快乐/段.ts';
import { 她态, 取景, 墙上几张, 气泡态, 照片态, 苦力怕态, 调子在, 转晴进度 } from './段/2-收集快乐/编排.ts';
import { 正片事件, 段内正片事件帧, 段窗口, 第几句, fps } from './分镜.ts';
import { 小木屋上空云, 云格们, 散起半径 } from './地点/原版云.ts';
import { 照片墙格位, 照片墙格角 } from './地点/照片墙格.ts';
import { 哈气站位, 第8句调子, 第8句镜头, 第8句镜头N } from './场/2-门口/第8句.ts';
import { 云剩, 洞半径 } from './场/2-门口/第8句云.ts';
import {
  云洞,
  挂照片声,
  照片手持角,
  照片手持边,
  照片框角,
  第8句末态,
  苦力怕前沿,
  苦力怕走速,
  苦力怕逃倍率,
  苦力怕掉头帧,
  原声让哈气,
  挂伸帧,
} from './场/2-门口/第8句参数.ts';
import { 第8句照片们 } from './特效/照片画.ts';
import { 正交顶面 } from './画风.ts';
import { 色板 } from './色板.ts';

// asset: 资产打包时才有，照片四张在测试里换成 1×1 的图。编排.ts 引的 vanillaWalk、CREEPER、门口.站排y 在 史蒂夫.tsx、苦力怕.tsx、门口小木屋.tsx 里，
// 那几个顶层就读模型、贴图（一路引到方块图集），换成桩：腿怎么摆这里不测；逃的速度照抄 CREEPER.speed.flee（groundSpeed(1.2)），站排y 照抄
const 一像素 = vi.hoisted(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
const 逃速原版 = vi.hoisted(() => ((0.3 ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20);
vi.mock('@库/角色/史蒂夫.tsx', () => ({ vanillaWalk: () => ({ limbSwing: 0, stride: 0 }) }));
vi.mock('@库/生物/苦力怕.tsx', () => ({ CREEPER: { speed: { flee: 逃速原版 } } }));
vi.mock('./地点/门口小木屋.tsx', () => ({ 门口: { 站排y: 0.5 } }));
vi.mock('asset:贴图/照片/第3句递蛋糕-二版', () => ({ default: 一像素 }));
vi.mock('asset:贴图/照片/第4句日落划船-二版', () => ({ default: 一像素 }));
vi.mock('asset:贴图/照片/第5句扑龙蛋-二版', () => ({ default: 一像素 }));
vi.mock('asset:贴图/照片/第7句光柱破云-二版', () => ({ default: 一像素 }));

const 事 = 段内正片事件帧('2-收集快乐');
const 半宽格 = 1280 / 第8句镜头.取景.每格;

describe('2-收集快乐：第 8 句整句一个镜头', () => {
  it('窗口从第 8 句首字到第 9 句首字（歌曲帧 611～687）', () => {
    const w = 段窗口('2-收集快乐');
    expect([w.起帧, w.止帧]).toEqual([611, 687]);
    expect(w.起帧 / fps).toBeCloseTo(第几句(8).起, 1);
    expect(段.帧数).toBe(76);
    expect(段.场窗口).toEqual({ 起帧: 611, 止帧: 687 });
  });

  it('拍：晴定 25.99，挂照片 26.53「收」，看见苦力怕 27.38，哈气 27.80，淘 28.23（差不到半帧）；一时一个焦点：调子定了才往框里推照片，挂上了苦力怕才冒头', () => {
    const 对 = [
      [正片事件.第8句晴定, 25.99], [正片事件.挂照片, 26.53], [正片事件.她看见苦力怕, 27.38], [正片事件.哈气, 27.8], [正片事件.苦力怕逃, 28.23],
    ] as const;
    for (const [e, 秒] of 对) expect(Math.abs(e.秒 - 秒)).toBeLessThan(0.5 / fps + 0.01);
    expect(正片事件.哈气.帧).toBe(667);
    expect(事.第8句晴定).toBeLessThanOrEqual(事.挂照片 - 挂伸帧);
    expect(事.挂照片).toBeLessThan(事.苦力怕冒头);
    expect(事.苦力怕冒头).toBeLessThan(事.她看见苦力怕);
  });

  it('cue：原声铺满整段（哈气那一截让一让）；挂照片声在挂照片那一帧起放；哈气声在哈气前 2 帧起放；没有纸声；都不过段尾', () => {
    const 声 = 段.声音 as 资产cue[];
    const 原 = 声.find((c) => c.名 === '原声')!;
    expect(原).toMatchObject({ 帧: 0, 帧数: 76, 入点秒: 611 / 24 });
    const 增益 = 原.增益 as number[];
    expect(增益[事.哈气]).toBeCloseTo(原声让哈气.增益, 6);
    expect(增益[0]).toBeGreaterThan(原声让哈气.增益);
    const 挂 = 声.find((c) => c.名 === '挂照片')!;
    expect(挂).toMatchObject({ 帧: 事.挂照片, 资产: 挂照片声.资产, 增益: 挂照片声.增益 });
    expect(挂.帧数).toBe(Math.ceil(挂照片声.秒 * fps));
    expect(声.find((c) => c.名 === '哈气')!.帧).toBe(事.哈气 - 2);
    expect(声.some((c) => c.资产.startsWith('音效/item.book.page_turn'))).toBe(false);
    for (const c of 声) expect(c.帧 + c.帧数).toBeLessThanOrEqual(段.帧数);
  });

  it('镜头：整句就是 第8句镜头，段首不再从天往下摇（核查 10-24：切过来头几帧是大半屏山墙）；中心落在偶数成片像素上', () => {
    expect(取景).toEqual(第8句镜头.取景);
    for (const v of 取景.中心) expect((v * 取景.每格) % 2).toBe(0);
  });

  it('调子：段首是第 7 句末的雨后暖阳，一路缓到 第8句晴定 起是 第8句调子', () => {
    expect(调子在(0)).toEqual(色板.雨后暖阳);
    expect(转晴进度(事.第8句晴定)).toBe(1);
    expect(调子在(事.第8句晴定)).toEqual(第8句调子);
    expect(调子在(段.帧数 - 1)).toEqual(第8句调子);
  });

  it('云：段首接第 7 句末（云洞半径 云洞.首），往大里开、晴定那一帧停在 云洞.末；第 7 句里散了的格不回来，洞走过的格散帧帧里散完', () => {
    expect(洞半径(段窗口('2-收集快乐').起帧 - 1)).toBe(云洞.首);
    expect(洞半径(正片事件.第8句晴定.帧)).toBe(云洞.末);
    expect(洞半径(段窗口('2-收集快乐').止帧 - 1)).toBe(云洞.末);
    const 帧们 = Array.from({ length: 段.帧数 }, (_, f) => 段窗口('2-收集快乐').起帧 + f);
    for (const [a, b] of 帧们.slice(1).map((f) => [f - 1, f] as const)) expect(洞半径(b)).toBeGreaterThanOrEqual(洞半径(a));
    // 铺满的假贴图：每格都有云
    const 格们 = 云格们(() => true);
    const 首帧 = 帧们[0]!, 末帧 = 帧们.at(-1)!;
    for (const c of 格们) {
      const 飘 = (帧: number) => -(帧 / fps) * 20 * 小木屋上空云.每刻飘;
      const r0 = 散起半径(c, 小木屋上空云.洞心, 飘(首帧 - 1));
      if (r0 <= 云洞.首) expect(云剩(c, 首帧)).toBe(0);
      // 整段云飘不到 2 格：段尾离洞心比 末 远 2 格以上的，一直没被洞够到
      if (散起半径(c, 小木屋上空云.洞心, 飘(末帧)) > 云洞.末 + 2) expect(云剩(c, 末帧)).toBe(1);
      for (const [a, b] of 帧们.slice(1).map((f) => [f - 1, f] as const)) expect(云剩(c, b)).toBeLessThanOrEqual(云剩(c, a));
    }
  });

  it('照片墙：墙上已经挂着前三张、第四只框空着；她举着光柱破云挡在空框前，挂伸帧 帧里推进框、缩到一格，挂照片那一帧换成墙上那张（不跳）', () => {
    expect(第8句照片们.map((p) => p.名)).toEqual(['递蛋糕', '日落划船', '扑龙蛋', '光柱破云']);
    for (let f = 0; f < 段.帧数; f++) {
      expect(墙上几张(f)).toBe(f < 事.挂照片 ? 3 : 4);
      expect(照片态(f) === null).toBe(f >= 事.挂照片);
    }
    expect(照片态(0)).toEqual({ 角: [...照片手持角], 边: 照片手持边 });
    expect(照片态(事.挂照片 - 挂伸帧)).toEqual(照片态(0));
    // 推的最后一帧已经和框里那张一样（挂上那一帧不跳）
    expect(照片态(事.挂照片 - 1)).toEqual({ 角: [...照片框角], 边: 1 });
    // 举着的时候在画面上挡住整只空框（框里那一格），不让空框露出来：斜投影里往后一格往上升 正交顶面 ÷ N 格
    const 框 = 照片墙格角(...照片墙格位.夏天[3]!);
    const 屏高 = (p: readonly number[]) => p[2]! + (p[1]! * 正交顶面) / 第8句镜头N;
    expect(照片手持角[0]).toBeLessThanOrEqual(框[0]);
    expect(屏高(照片手持角)).toBeLessThanOrEqual(屏高(框));
    expect(照片手持角[0] + 照片手持边).toBeGreaterThanOrEqual(框[0] + 1);
    expect(屏高(照片手持角) + 照片手持边).toBeGreaterThanOrEqual(屏高(框) + 1);
  });

  it('她整句站在门洞里（哈气站位.她）：哈气那一截侧身朝苦力怕哈气，前后都朝镜头', () => {
    for (let f = 0; f < 段.帧数; f++) {
      const 她 = 她态(f);
      expect(她.loc[0]).toBe(哈气站位.她);
      const 哈 = f >= 事.哈气 && f < 事.苦力怕逃;
      expect(她.姿势).toBe(哈 ? '哈气' : '站');
      expect(她.yaw).toBe(哈 ? 90 : 180);
    }
    expect(她态(事.她看见苦力怕).表情).toBe('惊讶');
  });

  it('苦力怕：冒头那一帧前脚刚进画框左边，哈气那一拍停在 哈气站位.苦力怕；冒头前不在画里；逃出画框在段尾之前', () => {
    const 左沿 = -半宽格;
    const 前脚 = (f: number) => 苦力怕态(f).loc[0] + 苦力怕前沿;
    expect(前脚(事.苦力怕冒头)).toBeGreaterThanOrEqual(左沿);
    expect(前脚(事.苦力怕冒头 - 1)).toBeLessThan(左沿);
    expect(苦力怕态(事.哈气).loc[0]).toBe(哈气站位.苦力怕);
    // 走速比原版追人（2.70 米/秒）快，但不到一倍半
    const 追 = (((1 * 0.25) ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20;
    expect(苦力怕走速 / 追).toBeGreaterThan(1);
    expect(苦力怕走速 / 追).toBeLessThan(1.5);
    const 逃 = 逃速原版 * 苦力怕逃倍率;
    const 出画帧 = 事.苦力怕掉头 + 苦力怕掉头帧 + ((哈气站位.苦力怕 - (左沿 - 苦力怕前沿)) / 逃) * fps;
    expect(出画帧).toBeLessThan(段.帧数 - 1);
    expect(苦力怕态(段.帧数 - 1).loc[0] + 苦力怕前沿).toBeLessThan(左沿);
  });

  it('末帧就是 第8句末态（第 9 句同机位匹配剪从这里接）：她朝镜头得意歪头、头顶「(✿◠‿◠)」，四张都在墙上', () => {
    const f = 段.帧数 - 1;
    const 她 = 她态(f);
    expect(她.yaw).toBe(第8句末态.她.yaw);
    expect(她.骨骼.Head!.rot).toEqual([-第8句末态.她.看[0], -第8句末态.她.看[1], 第8句末态.她.歪]);
    expect(气泡态(f)).toEqual({ 字: 第8句末态.她.气泡, x: 第8句末态.她.x });
    expect(墙上几张(f)).toBe(4);
  });
});
