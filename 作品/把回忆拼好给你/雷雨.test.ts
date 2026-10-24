// 第 6、7 句（段 2-雷雨、2-拨开阴霾，一个镜头）：事件顺序、炸掉一角的屋子和掉落物、四周的地、镜头（歌词那条下面、眼在地上）、云洞、光柱、阳光、雨、声音。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 设透视相机 } from '@engine/三渲二/机位.tsx';
import type { 资产cue } from '@engine/段/段定义.ts';
import 雷雨段 from './段/2-雷雨/段.ts';
import 拨开阴霾段 from './段/2-拨开阴霾/段.ts';
import 抢龙蛋段 from './段/2-抢龙蛋/段.ts';
import { fps, 段窗口, 正片事件, type 正片事件名 } from './分镜.ts';
import * as 参 from './场/2-雷雨/参数.ts';
import { 坑, 小木屋, 掉落位, 玩家捡得到, 箱子格, 南墙, 箱里, 箱里掉落们 } from './场/2-雷雨/弹坑.ts';
import { 四周方块, 地面高, 树们 } from './场/2-雷雨/地形.ts';
import { 云格们 } from './场/2-雷雨/云.ts';
import { 近雷, 雨声起帧, 雨量, 雷 } from './场/2-雷雨/声音.ts';
import { 云色, 天色 } from './场/2-雷雨/天气.ts';
import {
  云剩,
  云飘,
  天晴在,
  光柱透,
  光柱顶,
  发光区,
  屋子最远,
  她态,
  撞亮,
  机位,
  洞半径,
  洞心,
  转晴,
  透视雨片们,
  镜头止帧,
  镜头起帧,
  闪,
  阳光半径,
  阵大小,
} from './场/2-雷雨/编排.ts';

const 帧 = (名: 正片事件名) => 正片事件[名].帧;
const 雷雨 = 段窗口('2-雷雨');
const 拨开 = 段窗口('2-拨开阴霾');
const 末 = 镜头止帧 - 1;
const 全部帧 = Array.from({ length: 镜头止帧 - 镜头起帧 }, (_, k) => 镜头起帧 + k);
const 键 = (i: number, j: number, k: number) => `${i},${j},${k}`;

/** 场景点在画面上的位置（0～1：上 = 离顶边、左 = 离左边）；场景 Z 朝上，three Y 朝上 */
const 屏 = (f: number) => {
  const cam = new THREE.PerspectiveCamera();
  设透视相机(cam, 机位(f), 16 / 9);
  return ([x, y, z]: readonly number[]) => {
    const v = new THREE.Vector3(x!, z!, -y!).project(cam);
    return { 上: (1 - v.y) / 2, 左: (1 + v.x) / 2 };
  };
};
/** 歌词那条的下沿（占画面高的比例） */
const 歌词比 = 参.歌词下沿 / 1440;

describe('串：第 6、7 句', () => {
  it('2-雷雨 是第 6 句（首字到第 7 句首字），2-拨开阴霾 到第 8 句首字；前接 2-抢龙蛋、后接 2-收集快乐', () => {
    expect(段窗口('2-抢龙蛋').止帧).toBe(雷雨.起帧);
    expect(雷雨.止帧).toBe(拨开.起帧);
    expect(雷雨.止帧).toBe(帧('她站起'));
    expect(段窗口('2-收集快乐').起帧).toBe(拨开.止帧);
    expect([镜头起帧, 镜头止帧]).toEqual([雷雨.起帧, 拨开.止帧]);
  });

  it('事件按顺序；阳光铺地以后、切第 8 句之前留至少半秒看阳光照着屋子', () => {
    const 序: 正片事件名[] = ['第6句开口', '她看你', '你看她', '雷照缺口', '她站起', '阵起', '光柱起', '拨', '破云', '云洞开大', '阳光铺地', '照片-光柱破云', '光柱退', '第8句开口'];
    const 帧们 = 序.map(帧);
    for (let k = 1; k < 帧们.length; k++) expect(帧们[k], 序[k]).toBeGreaterThan(帧们[k - 1]!);
    expect(帧('第6句开口')).toBeGreaterThanOrEqual(雷雨.起帧);
    expect(拨开.止帧 - 帧('阳光铺地')).toBeGreaterThanOrEqual(fps / 2);
    expect(帧('照片-光柱破云')).toBeLessThan(拨开.止帧);
  });

  it('5→6 接缝：闪电落在切点上（2-雷雨 第 0 帧就在闪），雨声在 2-抢龙蛋 段尾先淡进来、段尾那一帧已经满了', () => {
    expect(帧('第6句闷雷')).toBe(雷雨.起帧);
    expect(闪(雷雨.起帧)).toBe(true);
    const 雨们 = (抢龙蛋段.声音 ?? []).filter((c): c is 资产cue => c.资产?.includes('weather.rain') === true);
    expect(雨们.length).toBeGreaterThan(0);
    const 头 = 雨们[0]!;
    expect(头.帧).toBeGreaterThan(段窗口('2-抢龙蛋').止帧 - 段窗口('2-抢龙蛋').起帧 - fps);
    const 增益 = 头.增益 as readonly number[];
    expect(Array.isArray(增益)).toBe(true);
    expect(增益[0]!).toBeLessThan(增益.at(-1)!);
    expect(雨声起帧).toBeLessThan(雷雨.起帧);
  });

  it('推到缺口近景那一帧又闪一道电，停住的近景里炸掉的格占画面四分之一以上、两个人整个在画面里（核查 10-24）', () => {
    expect(闪(帧('雷照缺口'))).toBe(true);
    expect(全部帧.filter(闪).length).toBe(2 * 参.闪帧们.reduce((n, [a, b]) => n + b - a, 0));
    for (const f of [帧('雷照缺口'), 帧('她站起') - 1]) expect(机位(f)).toEqual(机位(帧('雷照缺口')));
    const p = 屏(帧('雷照缺口'));
    const 角们 = [...坑().炸掉].flatMap((s) => {
      const [i, j, k] = s.split(',').map(Number) as [number, number, number];
      return [-0.5, 0.5].flatMap((dx) => [0, 1].flatMap((dy) => [0, 1].map((dz) => p([i + dx, j + dy, k + dz]))));
    });
    const 夹 = (v: number) => Math.min(1, Math.max(0, v));
    const [左们, 上们] = [角们.map((s) => 夹(s.左)), 角们.map((s) => 夹(s.上))];
    expect((Math.max(...左们) - Math.min(...左们)) * (Math.max(...上们) - Math.min(...上们))).toBeGreaterThanOrEqual(0.25);
    for (const [x, y] of [参.站位.她, 参.站位.你])
      for (const q of [[x! - 0.45, y!, 0], [x! + 0.45, y!, 0], [x!, y!, 1.5]]) {
        const s = p(q);
        expect(s.左).toBeGreaterThan(0.02);
        expect(s.左).toBeLessThan(0.98);
        expect(s.上).toBeLessThan(0.98);
      }
  });

  it('她看你、你看她：两下转头各自留够一秒（看得懂的速度）', () => {
    expect(帧('你看她') - 帧('她看你')).toBeGreaterThanOrEqual(fps / 2);
    expect(帧('她站起') - 帧('你看她')).toBeGreaterThanOrEqual(fps);
  });
});

describe('炸掉一角的屋子（种子 91）', () => {
  const { 留下, 炸掉, 掉落们 } = 坑();
  const 有 = (i: number, j: number, k: number) => 留下.some((b) => b.位[0] === i && b.位[1] === j && b.位[2] === k);

  it('屋子的格同 地点/门口小木屋.tsx（那边带组件、引不了，读源码对）；后墙补过的那块是 i 1～2、k 0～2', () => {
    const 源 = readFileSync(fileURLToPath(new URL('./地点/门口小木屋.tsx', import.meta.url)), 'utf8');
    expect(源).toContain(`西墙: ${小木屋.西墙}, 东墙: ${小木屋.东墙}, 后墙: ${小木屋.后墙}`);
    expect(源).toContain('const 补墙 = { i: [1, 2], k: [0, 2] } as const;');
    expect(源).toContain(`箱子: [${箱子格[0]}, ${箱子格[1] + 0.5}, ${箱子格[2]}]`);
  });

  it('箱子炸没了，掉出箱子本身；门也炸没了（方块拼搭 画不了箱子、门不掉图标，画面不另画这两样）', () => {
    expect(炸掉.has(键(...箱子格))).toBe(true);
    expect(掉落们.map((d) => d.物品)).toContain('minecraft:chest');
    expect(留下.filter((b) => /^minecraft:(chest|oak_door)/.test(b.状态))).toEqual([]);
    expect(掉落们.map((d) => d.物品)).not.toContain('minecraft:oak_door');
  });

  it('西南角：那根原木、南墙西半截（i 0～3）炸穿', () => {
    for (let k = 0; k <= 1; k++) expect(有(小木屋.西墙, 南墙, k), `原木 k ${k}`).toBe(false);
    for (let i = 1; i <= 3; i++) expect(留下.filter((b) => b.位[0] === i && b.位[1] === 南墙 && b.位[2] >= 0 && b.位[2] <= 1).length, `南墙 i ${i}`).toBe(0);
  });

  it('后墙炸开的格都在第 8 句补过的那块里；屋里东边（i ≥ 4）、东墙一格没炸；屋顶外面（k ≥ 4）完好', () => {
    const 后墙炸 = [...炸掉].map((k) => k.split(',').map(Number)).filter(([, j, k]) => j === 小木屋.后墙 && k! >= 0);
    expect(后墙炸.length).toBeGreaterThan(0);
    for (const [i, , k] of 后墙炸) expect(i! >= 1 && i! <= 2 && k! >= 0 && k! <= 2, `后墙 ${i},${k}`).toBe(true);
    for (const s of 炸掉) {
      const [i, j, k] = s.split(',').map(Number);
      if (j! >= 南墙 && j! <= 小木屋.后墙 && k! >= 0) expect(i!, `屋里 ${s}`).toBeLessThan(4);
      expect(k!, `屋顶 ${s}`).toBeLessThan(4);
    }
  });

  it('掉落物浮在坑里，离你、离她都够远，照原版不会被捡走', () => {
    for (const d of 掉落们) {
      const 位 = 掉落位(留下, d);
      expect(Number.isFinite(位[2]), d.物品).toBe(true);
      expect(玩家捡得到(位, 参.站位.你), `你 ${d.物品}`).toBe(false);
      expect(玩家捡得到(位, 参.站位.她), `她 ${d.物品}`).toBe(false);
    }
  });

  it('箱子里的东西全洒出来（不受衰减）、都停在坑底，和炸出来的几堆隔开半格以上，也不会被捡走（核查 10-24「掉落物多一点、大一点」）', () => {
    const 洒 = 箱里掉落们(留下);
    expect(洒.map((d) => d.物品)).toEqual(箱里.map((d) => d.物品));
    const 全 = [...掉落们.map((d) => 掉落位(留下, d)), ...洒.map((d) => d.位)];
    for (const d of 洒) {
      expect(d.位[2], d.物品).toBe(-1);
      expect(玩家捡得到(d.位, 参.站位.你), `你 ${d.物品}`).toBe(false);
      expect(玩家捡得到(d.位, 参.站位.她), `她 ${d.物品}`).toBe(false);
      for (const p of 全) if (p !== d.位) expect(Math.hypot(p[0] - d.位[0], p[1] - d.位[1]), d.物品).toBeGreaterThan(0.5);
    }
  });

  it('两个人紧挨着炸开的西南角坐（她离屋子西南外角不到 1.7 格、你在她旁边一格多），近景从南边看过去两人并排、都在缺口左边', () => {
    const 角 = [小木屋.西墙 - 0.5, 南墙] as const;
    expect(Math.hypot(参.站位.她[0] - 角[0], 参.站位.她[1] - 角[1])).toBeLessThan(1.7);
    expect(Math.hypot(参.站位.你[0] - 参.站位.她[0], 参.站位.你[1] - 参.站位.她[1])).toBeLessThan(1.3);
    const p = 屏(帧('她站起') - 1);
    const [她, 你, 缺口] = [p([参.站位.她[0], 参.站位.她[1], 0.6]), p([参.站位.你[0], 参.站位.你[1], 0.6]), p([1.5, 南墙, 0.5])];
    expect(她.左 - 你.左).toBeGreaterThan(0.06);
    expect(缺口.左 - 她.左).toBeGreaterThan(0.12);
  });

  it('她、你坐的那两格地面没炸（顶 z 0）', () => {
    for (const p of [参.站位.她, 参.站位.你]) expect(有(Math.round(p[0]), Math.floor(p[1]), -1), `${p}`).toBe(true);
  });
});

describe('四周的地（用户 10-24「怎么超平坦背景」）', () => {
  it('有起伏：屋子北边一百格里地面高低差至少 4 格；樱花林那道坡比平地高', () => {
    const 高们: number[] = [];
    for (let j = 20; j <= 120; j += 5) for (let i = -60; i <= 60; i += 5) 高们.push(地面高(i, j));
    expect(Math.max(...高们) - Math.min(...高们)).toBeGreaterThanOrEqual(4);
    expect(地面高(-16, 40)).toBeGreaterThanOrEqual(4);
  });

  it('有树：樱花林十几棵、橡树几棵，都长在地形里', () => {
    const t = 树们();
    expect(t.filter((x) => x.种 === '樱').length).toBeGreaterThanOrEqual(10);
    expect(t.filter((x) => x.种 === '橡').length).toBeGreaterThanOrEqual(3);
    const m = 四周方块();
    expect(m.樱花林.some((b) => b.状态.startsWith('minecraft:cherry_leaves'))).toBe(true);
    expect(m.平原.some((b) => b.状态.startsWith('minecraft:oak_leaves'))).toBe(true);
  });

  it('东北（第 7 句仰机位的右半边）地平线不是一条直线：屋子右后方 80～130 格有一道比平地高 6 格以上的山梁，梁上长着橡树', () => {
    const 眼 = 参.机位们.仰.眼;
    let 最高 = 0;
    for (let 角 = 30; 角 <= 50; 角 += 2)
      for (let d = 80; d <= 130; d += 4) {
        const r = (角 * Math.PI) / 180;
        最高 = Math.max(最高, 地面高(Math.round(眼[0] + d * Math.sin(r)), Math.floor(眼[1] + d * Math.cos(r))));
      }
    expect(最高).toBeGreaterThanOrEqual(6);
    const 梁上 = 树们().filter((t) => t.种 === '橡' && Math.atan2(t.i - 眼[0], t.j - 眼[1]) > (25 * Math.PI) / 180 && Math.hypot(t.i - 眼[0], t.j - 眼[1]) > 70);
    expect(梁上.length).toBeGreaterThanOrEqual(5);
  });

  it('屋前那块平地和四周接得上：平地边上一圈地面高 0～1', () => {
    for (let i = -17; i <= 17; i++) expect(Math.abs(地面高(i, 13)), `i ${i}`).toBeLessThanOrEqual(1);
  });
});

describe('镜头：一个镜头不切', () => {
  it('每一帧眼都在地面以上 1.5 格以上', () => {
    for (const f of 全部帧) {
      const 眼 = 机位(f).眼;
      expect(眼[2] - 地面高(Math.round(眼[0]), Math.floor(眼[1])), `帧 ${f}`).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('每一帧和上一帧机位差得不多（没有跳）', () => {
    for (const f of 全部帧.slice(1)) {
      const [a, b] = [机位(f - 1), 机位(f)];
      expect(Math.hypot(a.眼[0] - b.眼[0], a.眼[1] - b.眼[1], a.眼[2] - b.眼[2]), `帧 ${f}`).toBeLessThan(1.2);
    }
  });

  it('第 6 句：两个人的头、屋檐都在歌词那条下面、画面里', () => {
    for (const f of 全部帧.filter((x) => x < 帧('她站起'))) {
      const p = 屏(f);
      for (const q of [[参.站位.她[0], 参.站位.她[1], 1.3], [参.站位.你[0], 参.站位.你[1], 1.3]]) {
        const s = p(q);
        expect(s.上, `帧 ${f}`).toBeGreaterThan(歌词比);
        expect(s.上, `帧 ${f}`).toBeLessThan(1);
        expect(s.左, `帧 ${f}`).toBeGreaterThan(0);
        expect(s.左, `帧 ${f}`).toBeLessThan(1);
      }
    }
  });

  it('第 7 句：光柱冲上去的那一截顶、撞云那一点都在歌词那条下面（镜头跟着光柱往上抬）；她的脚、屋子整座在画面里', () => {
    const 底 = 2;
    for (const f of 全部帧.filter((x) => x >= 帧('光柱起'))) {
      const p = 屏(f);
      const 顶 = p([洞心()[0], 洞心()[1], Math.min(光柱顶(f, 底), 参.云底高)]);
      expect(顶.上, `帧 ${f}`).toBeGreaterThan(歌词比);
      expect(p(参.站位.她).上, `帧 ${f}`).toBeLessThan(1);
      for (const x of [小木屋.西墙 - 1.5, 小木屋.东墙 + 1.5]) {
        const s = p([x, 南墙, 0]);
        expect(s.左, `帧 ${f}`).toBeGreaterThan(0);
        expect(s.左, `帧 ${f}`).toBeLessThan(1);
        expect(s.上, `帧 ${f}`).toBeLessThan(1);
      }
    }
  });
});

describe('第 7 句：魔法阵、光柱、云洞、阳光', () => {
  it('她站起来以前不施法、没有阵', () => {
    expect(她态(帧('她站起') - 1).施法).toBe(false);
    expect(她态(帧('她站起')).施法).toBe(true);
    expect(阵大小(帧('阵起') - 1)).toBe(0);
    expect(阵大小(帧('光柱起'))).toBe(1);
  });

  it('光柱：光柱起 从底往上冲，拨 那一帧撞到云底，破云 以后穿过去；光柱退 以后淡掉', () => {
    expect(光柱顶(帧('光柱起') - 1, 2)).toBe(2);
    expect(光柱顶(帧('拨'), 2)).toBe(参.云底高);
    expect(光柱顶(帧('破云') - 1, 2)).toBe(参.云底高);
    expect(光柱顶(帧('破云') + 4, 2)).toBeGreaterThan(参.云底高 + 100);
    expect(光柱透(帧('光柱退') - 1)).toBe(1);
    expect(光柱透(末)).toBe(0);
  });

  it('撞云：拨 起亮，破云 以后退掉', () => {
    expect(撞亮(帧('拨') - 1)).toBe(0);
    expect(撞亮(帧('拨'))).toBeGreaterThan(0);
    expect(撞亮(末)).toBe(0);
  });

  it('云洞：破云 前没有，之后只开不合，段尾开到 r2', () => {
    expect(洞半径(帧('破云') - 1)).toBe(0);
    for (let f = 帧('破云') + 1; f <= 末; f++) expect(洞半径(f), `帧 ${f}`).toBeGreaterThan(洞半径(f - 1));
    expect(洞半径(末)).toBeCloseTo(参.云洞.r2, 6);
  });

  it('云：破云 前每格都在，段尾洞心 r1 以内的云散完', () => {
    const 全 = 云格们(() => true);
    for (const c of 全.slice(0, 200)) expect(云剩(c, 帧('破云') - 1)).toBe(1);
    const 近 = 全.filter((c) => Math.hypot(c.a * 12 + 6 - 洞心()[0], c.b * 12 + 6 - 洞心()[1]) < 参.云洞.r1);
    for (const c of 近) expect(云剩(c, 末), `${c.a},${c.b}`).toBe(0);
  });

  it('阳光：破云 以后从洞心一小圈铺开，阳光铺地 那一帧铺过整座屋子、之前没铺满', () => {
    expect(阳光半径(帧('破云') - 1)).toBe(0);
    expect(阳光半径(帧('阳光铺地'))).toBeGreaterThanOrEqual(屋子最远());
    expect(阳光半径(帧('云洞开大'))).toBeLessThan(屋子最远());
    for (const f of 全部帧) expect(发光区(f).length, `帧 ${f}`).toBeLessThanOrEqual(16);
  });

  it('洞里的天跟着散完的云格变蓝：破云 前没有；云还在（剩 > 0）的那一格底下透不出满的晴天，散完的格底下是晴天', () => {
    expect(天晴在(帧('破云') - 1)).toBeNull();
    const 全 = 云格们(() => true);
    for (const f of [帧('破云'), 帧('破云') + 2, 帧('云洞开大'), 末]) {
      const 晴 = 天晴在(f)!;
      const 飘 = 云飘(f);
      let 有剩 = 0, 有散完 = 0;
      for (const c of 全) {
        const 剩 = 云剩(c, f);
        const v = 晴(c.a * 12 + 6 + 飘, c.b * 12 + 6);
        expect(v, `帧 ${f} 格 ${c.a},${c.b}`).toBeCloseTo(1 - 剩, 6);
        if (剩 > 0 && 剩 < 1) 有剩++;
        if (剩 === 0) 有散完++;
      }
      if (f === 帧('破云') + 2) expect(有剩 + 有散完).toBeGreaterThan(0);
    }
  });

  it('转晴：破云 那一帧还是雷雨，阳光铺地 走完', () => {
    expect(转晴(帧('破云'))).toBe(0);
    expect(转晴(帧('阳光铺地'))).toBe(1);
  });
});

describe('天气、雨、声音', () => {
  it('原版的天色、云色：雷雨里云比天亮一档、都比晴天暗', () => {
    const [天, 云, 晴] = [天色(1, 参.雷暴), 云色(1, 参.雷暴), 天色(0, 0)];
    const 亮 = (c: readonly number[]) => c[0]! * 0.3 + c[1]! * 0.59 + c[2]! * 0.11;
    expect(亮(云)).toBeGreaterThan(亮(天));
    expect(亮(晴)).toBeGreaterThan(亮(天));
  });

  it('闪电只在第 6 句', () => {
    expect(全部帧.filter(闪).every((f) => f < 帧('她站起'))).toBe(true);
    expect(全部帧.some(闪)).toBe(true);
  });

  it('雨量：破云 前满，阳光铺地 停；透视雨每一帧都有片（雨停前）', () => {
    expect(雨量(帧('破云'))).toBe(1);
    expect(雨量(帧('阳光铺地'))).toBe(0);
    for (const f of [镜头起帧, 帧('她站起'), 帧('拨')]) expect(透视雨片们(机位(f).眼).length, `帧 ${f}`).toBeGreaterThan(50);
  });

  it('两段都有雨声；闷雷整个落在 2-雷雨，信标声在 2-拨开阴霾', () => {
    const 资产们 = (段: typeof 雷雨段) => (段.声音 ?? []).map((c) => (c as { 资产?: string }).资产);
    expect(资产们(雷雨段).filter((a) => a?.includes('weather.rain')).length).toBeGreaterThan(0);
    expect(资产们(拨开阴霾段).filter((a) => a?.includes('weather.rain')).length).toBeGreaterThan(0);
    expect(资产们(雷雨段).filter((a) => a === 参.雷声.资产).length).toBe(2);
    expect(资产们(拨开阴霾段)).toContain(参.信标声.资产);
    // 雷声文件前 0.25 秒几乎没声（参.雷声.提前秒），起点可以早于段首被切掉；滚雷那一下（闪）和结尾都在 2-雷雨 里
    expect(帧('第6句闷雷')).toBeGreaterThanOrEqual(雷雨.起帧);
    expect(雷.起帧 + (雷.帧数 ?? Infinity)).toBeLessThanOrEqual(雷雨.止帧);
    expect(近雷.起帧 + (近雷.帧数 ?? Infinity)).toBeLessThanOrEqual(雷雨.止帧);
  });
});
