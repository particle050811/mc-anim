import { describe, expect, it } from 'vitest';
import { 正片事件 } from './分镜.ts';
import {
  亮格于,
  分屏N,
  分屏态,
  分屏版式,
  成形,
  成形偏于,
  换姿帧们,
  日历窗,
  服务器取景,
  现实取景,
  门口长成帧,
  林生长,
} from './场/2-门口/分屏参数.ts';
import { 末帧速度 } from './段/2-空床/编排.ts';
import { 中景方块, 中景树们, 冒出, 远景方块, 远景树们 } from './地点/樱花林.ts';
import { 樱花树方块 } from './地点/樱花树.ts';
import { 正交顶面 } from './画风.ts';
import { 日历尺寸, 满页 } from './现实/日历.ts';
import { 摆放, 课表框 } from './现实/课桌布局.ts';

const 事 = 正片事件;
const 起 = 事.分屏起.帧;
const 止 = 事.第14句分屏.帧;
const 树根 = [-5, 1, 0] as const; // 地点/门口小木屋.tsx 门口.树苗 那一格（那边是 tsx，测试不引）

// 成片像素：服务器画布 0～1280、现实画布 1280～2560；一格 16N 个像素，往里一格画面上升 斜 格
const 每格 = 16 * 分屏N;
const 斜 = 正交顶面 / 分屏N;
const 服务器x = (x: number) => 分屏版式.服务器宽 + (x - 服务器取景.中心[0]) * 每格;
const 现实x = (x: number) => 分屏版式.服务器宽 * 2 + 分屏版式.现实宽 + (x - 现实取景.中心[0]) * 每格;
/** 剖面上 (z, 深 y) 那一点在画面上离顶边几像素 */
const 屏y = (z: number, y: number) => 720 - (z + 斜 * y - 现实取景.中心[1]) * 每格;

describe('第 13 句分屏', () => {
  it('分屏起：坡上没有樱花树、门口是树苗、日历 100、坐着、不褪色；日历到一：林子长满、树苗长成、停在 1、褪到 0.2', () => {
    const a = 分屏态(起);
    expect([a.生长, a.门口长成, a.日历, a.姿势, a.褪色]).toEqual([0, false, 100, 0, 0]);
    const b = 分屏态(事.日历到一.帧);
    expect([b.生长, b.门口长成, b.日历, b.姿势]).toEqual([1, true, 1, 1]);
    expect(b.褪色).toBeCloseTo(0.2, 9);
    expect(分屏态(止 - 1).日历).toBe(1);
  });

  it('林子跟着日历冒：生长 = 吹走的页数 ÷ 99；日历窗就是 风吹日历 到 日历到一 两拍；门口树苗在 日历到一 那一拍长成', () => {
    expect([林生长(满页), 林生长(1)]).toEqual([0, 1]);
    expect(冒出.页数).toBe(满页 - 1);
    expect(日历窗).toEqual({ 起: 事.风吹日历.帧 / 24, 止: 事.日历到一.帧 / 24 });
    expect(分屏态(事.风吹日历.帧 - 1).日历).toBe(100);
    expect(分屏态(事.风吹日历.帧).日历).toBe(99);
    expect(门口长成帧).toBe(事.日历到一.帧);
    expect(分屏态(门口长成帧 - 1).门口长成).toBe(false);
  });

  it('樱花树一棵棵冒出来、越冒越快（用户 10-25「应该是樱花树越来越多才对」）：起风前一棵没有，起风那一帧头一棵，停在 1 时都在', () => {
    const 樱 = [...中景树们, ...远景树们].filter((t) => t.种 === '樱');
    const 几棵 = (帧: number, ts = 樱) => ts.filter((t) => 分屏态(帧).生长 >= t.出).length;
    expect(几棵(事.风吹日历.帧 - 1)).toBe(0);
    expect(几棵(事.风吹日历.帧)).toBe(1);
    expect(几棵(事.日历到一.帧)).toBe(樱.length);
    // 左屏看得见的（出 不到 1；树干在左屏外的都等到 日历到一）一棵棵错开：每帧顶多冒两棵，前半个日历窗冒的比后半个少
    const 看得见 = 樱.filter((t) => t.出 < 1);
    expect(看得见.length).toBeGreaterThanOrEqual(20);
    for (let f = 事.风吹日历.帧; f < 事.日历到一.帧; f++) expect(几棵(f + 1, 看得见) - 几棵(f, 看得见)).toBeLessThanOrEqual(2);
    const 中 = Math.round((事.风吹日历.帧 + 事.日历到一.帧) / 2);
    expect(几棵(中, 看得见) - 几棵(事.风吹日历.帧, 看得见)).toBeLessThan(几棵(事.日历到一.帧 - 1, 看得见) - 几棵(中, 看得见));
    expect(几棵(事.日历到一.帧 - 1, 看得见)).toBe(看得见.length);
    // 起风前、停在 1 后方块不跟着变：0 没有樱花原木和樱花叶，1 和长满（第 14、15 句）是同一份
    const 有樱 = (bs: { 状态: string }[]) => bs.some((b) => /cherry_(log|leaves)/.test(b.状态));
    expect(有樱(中景方块(0)) || 有樱(远景方块(0))).toBe(false);
    expect(有樱(中景方块(1)) && 有樱(远景方块(1))).toBe(true);
  });

  it('冒出 的近景和 分屏N、树苗 一致；看得见 正是左屏（门贴着分屏线、往左 10 格）', () => {
    expect(冒出.近N).toBe(分屏N);
    expect(冒出.树苗x).toBe(树根[0]);
    expect(服务器x(冒出.看得见[0])).toBe(0);
    expect(服务器x(冒出.看得见[1])).toBe(分屏版式.服务器宽 * 2);
  });

  it('她只换一次姿势，每个姿势至少 1 秒（用户 10-24「画面转太快就删」）', () => {
    const 界 = [起, ...换姿帧们, 止];
    for (let i = 1; i < 界.length; i++) expect((界[i]! - 界[i - 1]!) / 24).toBeGreaterThanOrEqual(1);
    expect(换姿帧们).toHaveLength(1);
  });

  it('服务器那半：门贴着分屏线，长成的樱花树冠整个在画里', () => {
    expect(服务器x(0.5)).toBe(分屏版式.服务器宽 * 2);
    const 树 = 樱花树方块(true, 树根);
    expect(服务器x(Math.min(...树.map((b) => b.位[0]!)) - 0.5)).toBeGreaterThanOrEqual(0);
  });

  it('两半像素一样大、网格连成一张：现实那半左沿是贴图像素的边', () => {
    expect(服务器取景.每格).toBe(每格);
    expect(现实取景.每格).toBe(每格);
    const 相位 = (v: number) => ((Math.round(v * 1e6) / 1e6) % 分屏N + 分屏N) % 分屏N;
    for (const m of [-200, -77, -1, 0, 5]) expect(相位(现实x(m / 16))).toBe(相位(服务器x(0.5)));
  });

  it('右屏一个镜头：整张课表、日历都在右半屏里，课表顶边在歌词那一行（离顶 1.5 格）下面', () => {
    const 课表右 = 摆放.课表.x + 课表框.宽 * 摆放.课表.倍;
    expect(现实x(摆放.课表.x / 16)).toBeGreaterThanOrEqual(分屏版式.服务器宽 * 2 + 分屏版式.线宽 * 2);
    expect(现实x(课表右 / 16)).toBeLessThan(现实x(摆放.日历.x / 16));
    expect(现实x((摆放.日历.x + 日历尺寸.宽) / 16)).toBeLessThanOrEqual(2560);
    const 课表顶 = 屏y((摆放.课表.z + 课表框.高 * 摆放.课表.倍) / 16, 摆放.课表.y / 16);
    expect(课表顶).toBeGreaterThanOrEqual(1.5 * 每格);
    // 桌子前沿（z = 0、y = 0）和服务器那半的地面线同一条横线
    expect(现实取景.中心[1]).toBe(服务器取景.中心[1]);
  });

  it('课表亮格：41.87 亮第 1 节、42.29 亮第 2 节，之后一直亮着', () => {
    expect(亮格于(事.课表亮一.帧 - 1)).toEqual([]);
    expect(亮格于(事.课表亮一.帧 + 1).map((g) => g.节)).toEqual(['第1节']);
    expect(亮格于(事.风吹日历.帧)).toEqual([
      { 周: '周一', 节: '第1节', 亮: 1 },
      { 周: '周一', 节: '第2节', 亮: 1 },
    ]);
  });

  it('接入：头一步接上 2-空床 末帧的横移速度，越滑越慢，分屏成形到位 停稳；每帧落在贴图像素上', () => {
    const 速 = 末帧速度();
    const 页每帧 = (速.右 * 速.每格) / 2;
    expect(成形偏于(起)).toBe(成形.横);
    expect(Math.abs(成形偏于(起) - 成形偏于(起 + 1) - 页每帧)).toBeLessThanOrEqual(4);
    let 上 = Infinity;
    for (let f = 起; f <= 事.分屏成形到位.帧; f++) {
      const 偏 = 成形偏于(f);
      expect(偏 % (分屏N / 2)).toBe(0);
      expect(偏).toBeLessThan(上);
      上 = 偏;
    }
    expect(成形偏于(事.分屏成形到位.帧)).toBe(0);
  });
});
