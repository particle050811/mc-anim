// 第 6、7 句（段 2-雷雨、2-拨开阴霾）：坑的样子、剖面镜头（全景推近景）、帽子挡雨、气泡、女仆界面（推近）、声音、光柱破云那个镜头（阵、撞云、云洞、散云、阳光）。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 设透视相机 } from '@engine/三渲二/机位.tsx';
import 雷雨段 from './段/2-雷雨/段.ts';
import 拨开阴霾段 from './段/2-拨开阴霾/段.ts';
import { 段内正片事件帧, 段窗口, 正片事件, type 正片事件名 } from './分镜.ts';
import { 侧投影 } from './地点/侧剖面.tsx';
import { 正交顶面 } from './画风.ts';
import * as 参 from './场/2-雷雨/参数.ts';
import { 地表高, 坑, 坑壁, 掉落位, 玩家捡得到 } from './场/2-雷雨/弹坑.ts';
import { 光柱透, 光柱顶, 撞亮, 散了, 洞半径, 照片帧, 破云发光区, 破云机位, 破云止帧, 转暖, 透视雨片们, 阳光半径, 阵大小 } from './场/2-雷雨/破云编排.ts';
import { 雨量 } from './场/2-雷雨/声音.ts';
import { 取景, 帽挡雨, 帽在你头上, 掉落物们, 气泡态, 界面态, 镜N, 雨片们 } from './段/2-雷雨/编排.ts';

const 雷雨 = 段窗口('2-雷雨');
const 拨开 = 段窗口('2-拨开阴霾');
const 事 = 段内正片事件帧('2-雷雨');
const 帧 = (名: 正片事件名) => 正片事件[名].帧;
/** 歌词那条的下沿（页面像素，720 高的页面） */
const 歌词下沿 = 参.歌词下沿 / 2;

describe('串：第 6 到 7 句', () => {
  it('2-雷雨 从第 6 句开口到「拨」，2-拨开阴霾 从「拨」到第 8 句开口', () => {
    expect([雷雨.起帧, 雷雨.止帧, 拨开.起帧, 拨开.止帧]).toEqual([帧('第6句开口'), 帧('拨'), 帧('拨'), 帧('第8句开口')]);
    expect(段窗口('2-收集快乐').起帧).toBe(拨开.止帧);
  });

  it('事件按顺序，照片那一帧落在 2-拨开阴霾 里', () => {
    const 序: 正片事件名[] = ['第6句开口', '第6句闷雷', '第6句推近', '看你', '摘帽', '举帽', '第6句气泡', '你看她', '戴回帽子', '界面浮出', '界面到位', '放法术书', '界面淡出', '拨', '光柱到云', '破云', '云洞开大', '照片-光柱破云', '阳光铺地', '第8句开口'];
    const 帧们 = 序.map(帧);
    for (let k = 1; k < 帧们.length; k++) expect(帧们[k], 序[k]).toBeGreaterThan(帧们[k - 1]!);
    expect(照片帧).toBe(帧('照片-光柱破云'));
    expect(照片帧).toBeGreaterThanOrEqual(拨开.起帧);
    expect(照片帧).toBeLessThan(拨开.止帧);
  });
});

describe('坑：种子 690', () => {
  const { 留下, 炸掉, 掉落们 } = 坑();
  it('剖面那排：她坐的圆石墙脚顶 z 0，往东一格台阶顶 z −1，i 2～5 炸到 z −3', () => {
    expect(地表高(留下, 0)).toBe(0);
    expect(地表高(留下, 1)).toBe(-1);
    for (const i of [2, 3, 4, 5]) expect(地表高(留下, i), `i ${i}`).toBe(-3);
  });

  it('屋顶残块拿掉了（k ≥ 3 一块不剩）', () => {
    expect(留下.filter((b) => b.位[2] >= 3)).toEqual([]);
  });

  it('剖面镜头里（摇之前、之后）看得见的、地面以上的方块顶都在歌词那条下面；东墙角那截在画面右沿外', () => {
    for (const f of [0, 雷雨.止帧 - 雷雨.起帧 - 1]) {
      const 景 = 取景(f);
      const 投 = 侧投影(景, 1280, 720, 正交顶面);
      for (const b of 留下) {
        const [i, j, k] = b.位;
        if (j < 0 || k < 0) continue; // 地面（草、泥土）不算：后排的地斜着往上，最后一排的地沿在摇之前进歌词那条 9 像素
        const 左 = 投(i - 0.5, 0).x, 右 = 投(i + 0.5, 0).x;
        if (右 <= 0 || 左 >= 1280) continue;
        expect(投(i, k + 1, j + 1).y, `${b.状态} @ ${b.位}`).toBeGreaterThan(歌词下沿);
      }
    }
    expect(侧投影(取景(0), 1280, 720)(6.5, 0).x).toBeGreaterThanOrEqual(1280);
  });

  it('镜头中心落在成片的偶数像素上', () => {
    for (let f = 0; f < 雷雨.止帧 - 雷雨.起帧; f++) {
      const 景 = 取景(f);
      for (const v of 景.中心) {
        const px = v * 景.每格;
        expect(Math.abs(px - Math.round(px))).toBeLessThan(1e-9);
        expect(((Math.round(px) % 2) + 2) % 2).toBe(0);
      }
    }
  });

  it('全景到 第6句推近，推帧 帧推到近景，之后一直是近景的 N（她的头在手机 390 宽上 40 像素上下）', () => {
    const 末 = 雷雨.止帧 - 雷雨.起帧 - 1;
    for (let f = 0; f < 事.第6句推近; f++) expect(镜N(f)).toBe(参.坑镜头.全景.N);
    for (let f = 事.第6句推近 + 参.坑镜头.推帧 - 1; f <= 末; f++) expect(镜N(f), `帧 ${f}`).toBe(参.坑镜头.近景.N);
  });

  it('气泡那几帧：气泡顶（一行：字行高 9 + 上下边距各 5，库/界面/女仆气泡.tsx）在歌词那条下面', () => {
    const [x, y, z] = 参.站位.她;
    const 锚高 = 1.75; // 库/界面/女仆气泡.tsx 的 女仆气泡锚高(true)（引那个文件要带贴图资产，测试里取不到）
    for (let f = 事.第6句气泡; f < 事.戴回帽子; f++) {
      const 锚 = 侧投影(取景(f), 1280, 720, 正交顶面)(x, z + 锚高, y);
      expect(锚.y * 2 - (9 + 2 * 5) * 参.气泡缩放, `帧 ${f}`).toBeGreaterThan(参.歌词下沿);
    }
  });

  it('坑壁只算 j ≥ 1、挨着炸掉的格的方块', () => {
    const 壁 = 留下.filter((b) => 坑壁(炸掉, b));
    expect(壁.length).toBeGreaterThan(0);
    expect(壁.every((b) => b.位[1] >= 1)).toBe(true);
  });

  it('掉落物：门落在你身边被你捡走，别的都还浮着', () => {
    const 剖面里的 = 掉落们.filter((d) => d.格[1] >= 0);
    const 捡走 = 剖面里的.filter((d) => 玩家捡得到(掉落位(留下, d), 参.站位.你));
    expect(捡走.map((d) => d.物品)).toEqual(['minecraft:oak_door']);
    expect(掉落物们().length).toBe(剖面里的.length - 1);
    expect(掉落物们().some((d) => d.物品 === 'minecraft:oak_door')).toBe(false);
  });
});

describe('第 6 句：帽子挡雨、气泡、界面', () => {
  const 末 = 雷雨.止帧 - 雷雨.起帧 - 1;
  it('帽子举在你头上那几帧，你头顶那几列的雨停在帽顶；别的帧不挡', () => {
    const 范围 = [-6, 6] as const;
    expect(帽挡雨(事.举帽 - 1)).toEqual([]);
    const f = [...Array(末 + 1).keys()].find(帽在你头上)!;
    expect(f).toBeDefined();
    const 挡 = 帽挡雨(f);
    expect(挡.length).toBe(参.帽形.length);
    const 平时 = 雨片们(范围);
    const 挡了 = 雨片们(范围, 挡);
    expect(挡了.length).toBeGreaterThan(平时.length);
    const 帽顶 = Math.min(...挡.map((a) => a.顶));
    expect(挡了.some((p) => p.底 >= 帽顶)).toBe(true);
    expect(挡了.filter((p) => p.中心[1] >= 参.站位.她[1])).toEqual(平时.filter((p) => p.中心[1] >= 参.站位.她[1]));
  });

  it('气泡从第 6 句气泡冒到她把帽子戴回去', () => {
    expect(气泡态(事.第6句气泡 - 1)).toBeNull();
    expect(气泡态(事.第6句气泡)?.字).toBe(参.第6句气泡字);
    expect(气泡态(事.戴回帽子 - 1)).not.toBeNull();
    expect(气泡态(事.戴回帽子)).toBeNull();
    for (let f = 事.界面浮出; f <= 末; f++) expect(气泡态(f)).toBeNull();
  });

  it('界面推近：缩放走偶数、左上在偶数像素；推完法术书图标在手机 390 宽上 20 像素以上，立绘、副手槽在歌词那条下面、画面里', () => {
    for (let f = 事.界面浮出; f < 事.界面淡出 + 参.界面淡出帧 - 1; f++) {
      const 态 = 界面态(f)!;
      expect(态.缩放 % 2, `帧 ${f}`).toBe(0);
      for (const v of 态.左上) expect(v % 2).toBe(0);
    }
    const 态 = 界面态(事.界面淡出 - 1)!;
    const s = 态.缩放;
    expect((16 * s * 390) / 2560).toBeGreaterThanOrEqual(20);
    const [左, 上] = 态.左上;
    expect(上).toBeGreaterThanOrEqual(参.歌词下沿);
    expect(左 + 6 * s).toBeGreaterThanOrEqual(0);
    expect(上 + 107 * s).toBeLessThanOrEqual(1440);
    expect(左 + (参.副手格[0] + 16) * s).toBeLessThanOrEqual(2560);
    expect(上 + (参.副手格[1] + 16) * s).toBeLessThanOrEqual(1440);
  });

  it('女仆界面：浮上来、拿书、放进副手、淡出，切镜头前关掉', () => {
    expect(界面态(事.界面浮出 - 1)).toBeNull();
    expect(界面态(事.界面浮出)!.浮).toBeGreaterThan(0);
    expect(界面态(事.界面浮出)!.书在).toBe('快捷栏');
    expect(界面态(事.界面到位)).toMatchObject({ 浮: 1, 书在: '鼠标', 拿着书: true });
    expect(界面态(事.放法术书)).toMatchObject({ 书在: '副手', 拿着书: false });
    expect(界面态(事.放法术书 - 1)!.缩放).toBe(参.界面缩放);
    expect(界面态(事.放法术书 - 1)!.左上).toEqual([参.界面位.左, 参.界面位.上]);
    expect(界面态(事.放法术书 + 参.界面推近.帧 - 1)!.缩放).toBe(参.界面推近.缩放);
    expect(界面态(事.界面淡出 - 1)!.透).toBe(1);
    expect(界面态(事.界面淡出 + 参.界面淡出帧 - 1)).toBeNull();
    expect(界面态(末)).toBeNull();
  });
});

describe('声音', () => {
  const 资产们 = (段: typeof 雷雨段) => (段.声音 ?? []).map((c) => (c as { 资产?: string }).资产);
  it('两段都有雨声；闷雷在 2-雷雨，信标声在 2-拨开阴霾', () => {
    expect(资产们(雷雨段).filter((a) => a?.includes('weather.rain')).length).toBeGreaterThan(0);
    expect(资产们(拨开阴霾段).filter((a) => a?.includes('weather.rain')).length).toBeGreaterThan(0);
    expect(资产们(雷雨段)).toContain(参.雷声.资产);
    expect(资产们(拨开阴霾段)).toContain(参.信标声.资产);
  });

  it('雨量：破云前满，阳光铺地停', () => {
    expect(雨量(帧('破云'))).toBe(1);
    expect(雨量(帧('阳光铺地'))).toBe(0);
  });
});

describe('第 7 句：光柱破云', () => {
  const 末 = 破云止帧 - 1;
  /** 场景点在画面上离顶边多少（0～1）；场景 Z 朝上，three Y 朝上 */
  const 屏 = (f: number) => {
    const cam = new THREE.PerspectiveCamera();
    设透视相机(cam, 破云机位(f), 16 / 9);
    cam.updateMatrixWorld();
    return ([x, y, z]: readonly number[]) => {
      const v = new THREE.Vector3(x!, z!, -y!).project(cam);
      return { 上: (1 - v.y) / 2, 左: (1 + v.x) / 2 };
    };
  };
  const 她 = 参.破云站位.她;

  it('洞：破云前没有，之后只开不合，段尾开到 r2', () => {
    expect(洞半径(帧('破云') - 1)).toBe(0);
    let 前 = 0;
    for (let f = 帧('破云'); f <= 末; f++) {
      expect(洞半径(f)).toBeGreaterThanOrEqual(前);
      前 = 洞半径(f);
    }
    expect(洞半径(末)).toBeCloseTo(参.云洞.r2, 6);
    expect(洞半径(照片帧)).toBeGreaterThan(0);
  });

  it('光柱：光柱到云 起顶停在云层顶面，比 破云 早；阳光铺地 起 退帧 帧淡掉', () => {
    expect(光柱顶(帧('光柱到云') - 1, 2)).toBeLessThan(参.云.高);
    expect(光柱顶(帧('光柱到云'), 2)).toBe(参.云.高 + 参.云.厚);
    expect(光柱顶(照片帧, 2)).toBe(参.云.高 + 参.云.厚);
    expect(帧('光柱到云')).toBeLessThan(帧('破云'));
    expect(光柱透(帧('阳光铺地') - 1)).toBe(1);
    expect(光柱透(照片帧)).toBe(1);
    expect(光柱透(帧('阳光铺地') + 参.光柱.退帧 - 1)).toBe(0);
  });

  it('魔法阵：近机位停着的时候已经展开完（核查 10-24：原来阵还没展开完镜头就拉远了）', () => {
    const 停完 = 帧('拨') + 参.破云镜头.停 - 1;
    expect(阵大小(帧('拨') + 参.破云阵.展开帧 - 1)).toBe(1);
    expect(帧('拨') + 参.破云阵.展开帧 - 1).toBeLessThan(停完);
    expect(破云机位(停完).眼).toEqual(破云机位(帧('拨')).眼);
  });

  it('撞云：光柱到云 那一帧起云底亮，破云 以后退掉；亮的那圈在画里', () => {
    expect(撞亮(帧('光柱到云') - 1).强).toBe(0);
    expect(撞亮(帧('光柱到云')).强).toBe(1);
    expect(撞亮(帧('光柱到云')).半径).toBeGreaterThan(0);
    expect(撞亮(帧('破云') + 参.撞云.退帧 - 1).强).toBe(0);
    const q = 屏(帧('光柱到云'))([她[0], 她[1], 参.云.高]);
    expect(q.上).toBeGreaterThan(歌词下沿 / 720);
    expect(q.上).toBeLessThan(1);
  });

  it('云散开：云洞开大 前不散，段尾散到 散云.到', () => {
    expect(散了(帧('云洞开大') - 1)).toBe(0);
    expect(散了(末)).toBeCloseTo(参.散云.到, 6);
  });

  it('阳光：从她脚下一小圈铺开（不是一帧铺满），只增不减，段尾铺到 半径', () => {
    const 起 = 帧('阳光铺地') - 参.阳光.前帧;
    expect(阳光半径(起 - 1)).toBe(0);
    expect(阳光半径(起)).toBeCloseTo(参.阳光.起半径, 6);
    for (let f = 起 + 1; f <= 末; f++) expect(阳光半径(f)).toBeGreaterThan(阳光半径(f - 1));
    expect(阳光半径(起 + 1)).toBeLessThan(参.阳光.半径 / 4);
    expect(阳光半径(末)).toBeCloseTo(参.阳光.半径, 6);
  });

  it('远机位：照片帧 洞口（连毛边、云厚）整圈在画面里，她的脚在画面里', () => {
    const p = 屏(照片帧);
    const r = 洞半径(照片帧) + (参.云洞.毛边 + 参.云洞.毛边比 * 洞半径(照片帧)) / 2 + 参.云.格 / 2;
    for (let a = 0; a < 360; a += 5) {
      const t = (a * Math.PI) / 180;
      for (const z of [参.云.高, 参.云.高 + 参.云.厚]) {
        const q = p([她[0] + r * Math.cos(t), 她[1] + r * Math.sin(t), z]);
        expect(q.上, `${a}°`).toBeGreaterThan(0);
        expect(q.左, `${a}°`).toBeGreaterThan(0);
        expect(q.左, `${a}°`).toBeLessThan(1);
      }
    }
    for (const f of [照片帧, 末]) {
      expect(屏(f)(她).上).toBeLessThan(1);
      expect(屏(f)([她[0], 她[1], 2.2]).上).toBeGreaterThan(0.5);
    }
  });

  it('调子：拨那一帧还是雷雨，阳光铺地走完', () => {
    expect(转暖(帧('拨'))).toBe(0);
    expect(转暖(帧('阳光铺地'))).toBe(1);
    expect(破云发光区(帧('拨') - 1)).toEqual([]);
    expect(破云发光区(末).length).toBeGreaterThan(参.阳光.条数);
    expect(破云发光区(末).length).toBeLessThanOrEqual(16);
  });

  it('透视雨：近机位、远机位都有雨片，越远越淡', () => {
    for (const f of [帧('拨'), 末]) {
      const 片们 = 透视雨片们(破云机位(f).眼);
      expect(片们.length).toBeGreaterThan(50);
      expect(Math.min(...片们.map((p) => p.透))).toBeGreaterThanOrEqual(0.5);
      expect(Math.max(...片们.map((p) => p.透))).toBeLessThanOrEqual(1);
    }
  });
});
