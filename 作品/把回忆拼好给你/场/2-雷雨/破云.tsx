// 第 7 句「拨」起的透视镜头（段 2-拨开阴霾）：近机位略俯拍，她站在坑沿把法术书举起来，脚下魔法阵带着地光展开，一道光柱从书上往上冲；
// 镜头拉远仰拍，光柱撞亮云底，云撕开一个洞、透出亮天，洞越开越大、洞外的云一团团散掉，画面从灰往暖走，阳光从她脚下一小圈铺开、雨停、光柱淡掉。
// 你在台阶上只露出头肩，仰头看光柱。每一帧的样子在 破云编排.ts。
// 光柱破云画面 = 照片「光柱破云」那一帧（不带歌词、不带界面），给第 8 句收照片用。
// 演绎：「书放进副手 → 她当场放法术破云」游戏里没有。万法皆通 1.9.3（zh_cn.json task.maidspell.spell_combat_*）里女仆确实认副手、主手、背包里的法术书，
// 但只在工作模式切到「法术战斗」「远程法术」、身边有敌人时才放，放的是书里刻好的铁魔法法术；界面里她的任务是「空闲」，铁魔法也没有往天上打光柱、把雨云打散的法术。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { clamp01 } from '@engine/anim/anim.ts';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { png } from '@engine/model/贴图.ts';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx, magicalWineFoxBoneAt, magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { solveReach } from '@库/角色/手臂逆解.ts';
import { standPose } from '@库/角色/骨架.tsx';
import beamUri from 'asset:贴图/特效/信标光柱';
import { fps, 画幅 } from '../../分镜.ts';
import { 格原点 } from '../../地点/门口小木屋.tsx';
import { 画布调子 } from '../../画风.ts';
import { 学徒法术书 } from '../../物品/学徒法术书.tsx';
import * as 参 from './参数.ts';
import { 坑, 远地方块 } from './弹坑.ts';
import { 光柱顶, 光柱透, 云在, 撞亮, 散了, 洞半径, 照片帧, 破云发光区, 破云机位, 破云调子, 透视雨片们, 阵大小, 阵转 } from './破云编排.ts';
import { 雨量 } from './声音.ts';
import { 混色 } from './调子.ts';
import { 魔法阵, 魔法阵半径 } from './酒狐件.tsx';
import { 雨 } from './雨.tsx';

const 她位 = 参.破云站位.她;

// ---------- 她：站着，左手把书举起来 ----------
type 骨表 = Record<string, BonePose>;
const 臂骨 = (x: readonly number[]): 骨表 => ({ LeftArm: { rot: [x[0]!, x[1]!, x[2]!] }, LeftForeArm: { rot: [x[3]!, 0, 0] } });

const 她的样子 = (秒: number): 魔法酒狐新动作Props => {
  const p: 魔法酒狐新动作Props = {
    pose: { ...standPose([...她位] as V3), yaw: 参.破云朝向.她 },
    姿势: '站',
    表情: '微笑',
    看: 参.破云朝向.她看,
    秒,
    眨眼: 'auto',
  };
  const 表 = magicalWineFoxExBones(p);
  const 目标: V3 = [她位[0] + 参.举书.手[0], 她位[1] + 参.举书.手[1], 她位[2] + 参.举书.手[2]];
  const x = solveReach(
    (x) => magicalWineFoxBoneAt(p.pose, { ...表, ...臂骨(x) }, 'LeftHand'),
    [...参.举书.初值],
    目标,
    [0.0008, 0.0008, 0.0008, 0.0008],
    [[-200, 60], [-90, 90], [-160, 40], [-150, 0]],
  );
  return { ...p, 骨骼: 臂骨(x) };
};
/** 书心：手腕往上 书离手 格（书见 参数.ts 举书） */
const 书心 = (p: 魔法酒狐新动作Props): V3 => {
  const [x, y, z] = magicalWineFoxBoneAt(p.pose, magicalWineFoxExBones(p), 'LeftHand');
  return [x, y, z + 参.举书.书离手];
};
/** 举着的书：立着、封面朝她正前方（物品空间正面朝 +Z、上 = +Y → 先绕 X 转 90° 立起来，再绕 Z 转到她的朝向） */
const 举着的书: React.FC<{ 心: V3 }> = ({ 心 }) => (
  <group position={心} rotation={[0, 0, ((参.破云朝向.她 + 180) * Math.PI) / 180]} scale={参.举书.书大}>
    <group rotation={[Math.PI / 2, 0, 0]}>
      <学徒法术书 />
    </group>
  </group>
);

// ---------- 地光：阵底下两层同心圆片（圆边按贴图像素走成阶梯），普通半透明叠 ----------
const 像素 = 1 / 16;
const 圆们 = new Map<number, { g: THREE.PlaneGeometry; tex: THREE.DataTexture }>();
/** 半径 r（取到贴图像素）的圆片：格子中心在圆里就满、不在就空，最近邻采样 */
const 圆 = (r: number) => {
  const n = Math.max(1, Math.round(r / 像素));
  let c = 圆们.get(n);
  if (!c) {
    const 边 = 2 * n;
    const data = new Uint8Array(边 * 边 * 4);
    for (let j = 0; j < 边; j++)
      for (let i = 0; i < 边; i++) data.set([255, 255, 255, (i + 0.5 - n) ** 2 + (j + 0.5 - n) ** 2 <= n * n ? 255 : 0], (j * 边 + i) * 4);
    const tex = new THREE.DataTexture(data, 边, 边, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    圆们.set(n, (c = { g: new THREE.PlaneGeometry(边 * 像素, 边 * 像素), tex }));
  }
  return c;
};
const 地光: React.FC<{ 心: V3; 大小: number }> = ({ 心, 大小 }) => {
  const { 色, 半径, 强 } = 参.破云阵.地光;
  if (大小 <= 0) return null;
  return (
    <group position={心}>
      {半径.map((k, i) => {
        const c = 圆(魔法阵半径 * k * 大小);
        return (
          <mesh key={i} geometry={c.g} position={[0, 0, i * 0.002]} renderOrder={4}>
            <meshBasicMaterial color={色} map={c.tex} transparent opacity={强[i]} depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------- 云：一层铺满的方块云，洞附近一格一格画（洞口有侧面），外面四大块 ----------
// 原版云的四面明暗：顶 1.0、东西 0.9、南北 0.8、底 0.7（同 engine/light/天空.tsx 的 Clouds）
const 云明暗 = { 底: 0.7, 东西: 0.9, 南北: 0.8 };
const 拆 = (hex: string) => {
  const c = new THREE.Color(hex);
  c.convertSRGBToLinear();
  return c;
};

/** 云层：心 = 洞心（光柱）；r = 洞半径；散 = 洞外没掉了多少；撞 = 光柱撞云那一圈云底的亮；暖 = 洞口暖边的强 */
const 云层: React.FC<{ 心: readonly [number, number]; r: number; 散: number; 撞: { 强: number; 半径: number }; 色: string; 暖: number }> = ({ 心, r, 散, 撞, 色, 暖 }) => {
  const { 高, 格, 厚, 铺, 暖色, 暖宽 } = 参.云;
  const geo = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const 面 = (a: V3, b: V3, c: V3, d: V3, 色线性: THREE.Color, 明: number) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) col.push(色线性.r * 明, 色线性.g * 明, 色线性.b * 明);
    };
    const z0 = 高, z1 = 高 + 厚;
    // 盒子：底面、四个侧面（顶面从下面看不见，不画）；侧面只在 侧[k] 为真时画；亮 = 0～1，四面的明暗往 1 走（撞亮的那几格像自己发光）
    const 盒 = (x0: number, y0: number, x1: number, y1: number, c: THREE.Color, 侧: readonly boolean[], 亮 = 0) => {
      const 明 = (m: number) => m + (1 - m) * 亮;
      面([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], c, 明(云明暗.底));
      if (侧[0]) 面([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], c, 明(云明暗.东西));
      if (侧[1]) 面([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], c, 明(云明暗.东西));
      if (侧[2]) 面([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], c, 明(云明暗.南北));
      if (侧[3]) 面([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], c, 明(云明暗.南北));
    };
    const 底色 = 拆(色);
    const 暖色线性 = 拆(暖色);
    const 撞色 = 拆(参.光柱.色);
    // 一格一格画的那块：洞心 ± 云格圈 格
    const n = 参.云格圈;
    const [a0, b0] = [Math.round(心[0] / 格) - n, Math.floor(心[1] / 格) - n];
    const [a1, b1] = [a0 + 2 * n, b0 + 2 * n];
    const 有 = (a: number, b: number) => a < a0 || a > a1 || b < b0 || b > b1 || 云在(a * 格, (b + 0.5) * 格, 心, r, 散);
    for (let a = a0; a <= a1; a++)
      for (let b = b0; b <= b1; b++) {
        if (!有(a, b)) continue;
        const [x, y] = [a * 格, (b + 0.5) * 格];
        const 离心 = Math.hypot(x - 心[0], y - 心[1]);
        const 离洞 = r > 0 ? 离心 - r : Infinity;
        const w = 暖 * clamp01(1 - 离洞 / 暖宽);
        const 撞w = 撞.强 * clamp01(1 - 离心 / Math.max(撞.半径, 1e-6));
        const c = 底色.clone().lerp(暖色线性, w).lerp(撞色, 撞w);
        // 洞口那一圈被洞里的太阳照透（演绎），也往满亮走一些，不压成土黄
        盒(x - 格 / 2, y - 格 / 2, x + 格 / 2, y + 格 / 2, c, [!有(a + 1, b), !有(a - 1, b), !有(a, b + 1), !有(a, b - 1)], Math.max(撞w, 参.云.暖亮 * w));
      }
    // 外面四大块（不画侧面）
    const [X0, X1, Y0, Y1] = [(a0 - 0.5) * 格, (a1 + 0.5) * 格, b0 * 格, (b1 + 1) * 格];
    const 无侧 = [false, false, false, false];
    盒(心[0] - 铺, 心[1] - 铺, X0, 心[1] + 铺, 底色, 无侧);
    盒(X1, 心[1] - 铺, 心[0] + 铺, 心[1] + 铺, 底色, 无侧);
    盒(X0, 心[1] - 铺, X1, Y0, 底色, 无侧);
    盒(X0, Y1, X1, 心[1] + 铺, 底色, 无侧);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [心[0], 心[1], r, 散, 撞.强, 撞.半径, 色, 暖, 高, 格, 厚, 铺, 暖色, 暖宽]);
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false }), []);
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};

/** 洞里的亮天：云上面很高的一张平面 */
const 亮天: React.FC<{ 心: readonly [number, number] }> = ({ 心 }) => {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: 参.亮天.色, side: THREE.DoubleSide, toneMapped: false, fog: false }), []);
  return (
    <mesh position={[心[0], 心[1], 参.亮天.高]} material={mat} frustumCulled={false}>
      <planeGeometry args={[参.亮天.铺 * 2, 参.亮天.铺 * 2]} />
    </mesh>
  );
};

// ---------- 光柱：照原版 BeaconRenderer.renderBeaconBeam ----------
let 光柱贴图: THREE.DataTexture | undefined;
const 取光柱贴图 = () => {
  if (!光柱贴图) {
    const p = png(beamUri);
    光柱贴图 = new THREE.DataTexture(p.px, p.w, p.h, THREE.RGBAFormat);
    光柱贴图.colorSpace = THREE.SRGBColorSpace;
    光柱贴图.magFilter = THREE.NearestFilter;
    光柱贴图.minFilter = THREE.NearestFilter;
    光柱贴图.wrapS = THREE.RepeatWrapping;
    光柱贴图.wrapT = THREE.RepeatWrapping;
    光柱贴图.needsUpdate = true;
  }
  return 光柱贴图;
};

/** 一圈四个竖面：角 = 四个角的水平坐标（相对柱心），v 从底 v底 到顶 v顶 */
const 柱面 = (角: readonly (readonly [number, number])[], 底: number, 顶: number, v底: number, v顶: number) => {
  const pos: number[] = [];
  const uv: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [a, b] = [角[k]!, 角[(k + 1) % 4]!];
    pos.push(a[0], a[1], 顶, a[0], a[1], 底, b[0], b[1], 底, a[0], a[1], 顶, b[0], b[1], 底, b[0], b[1], 顶);
    uv.push(1, v顶, 1, v底, 0, v底, 1, v顶, 0, v底, 0, v顶);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
};

const 光柱件: React.FC<{ 底: V3; 顶: number; 刻: number; 透: number }> = ({ 底, 顶, 刻, 透 }) => {
  const h = 顶 - 底[2];
  // 原版：f = floorMod(gameTime, 40) + partialTick；往上的柱 f1 = −f；贴图滚 f2 = frac(f1·0.2 − floor(f1·0.1))；里层转 f·2.25 − 45 度
  const f = (((刻 % 40) + 40) % 40);
  const f1 = -f;
  const f2 = f1 * 0.2 - Math.floor(f1 * 0.1) - Math.floor(f1 * 0.2 - Math.floor(f1 * 0.1));
  const v0 = -1 + f2;
  const { 里, 外, 外透, 色 } = 参.光柱;
  const 转 = ((f * 2.25 - 45) * Math.PI) / 180;
  const 里角 = ([[0, 里], [里, 0], [0, -里], [-里, 0]] as const).map(([x, y]) => [x * Math.cos(转) - y * Math.sin(转), x * Math.sin(转) + y * Math.cos(转)] as const);
  const 外角 = [[-外, -外], [外, -外], [外, 外], [-外, 外]] as const;
  const 里geo = useMemo(() => 柱面(里角, 0, h, v0, h * (0.5 / 里) + v0), [h, v0, 转]);
  const 外geo = useMemo(() => 柱面(外角, 0, h, v0, h + v0), [h, v0]);
  useEffect(() => () => { 里geo.dispose(); 外geo.dispose(); }, [里geo, 外geo]);
  const 里mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: 取光柱贴图(), color: 色, side: THREE.DoubleSide, toneMapped: false, fog: false, ...(透 < 1 ? { transparent: true, opacity: 透, depthWrite: false } : {}) }),
    [色, 透],
  );
  const 外mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: 取光柱贴图(), color: 色, transparent: true, opacity: 外透 * 透, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    [色, 外透, 透],
  );
  if (h <= 0 || 透 <= 0) return null;
  return (
    <group position={底}>
      <mesh geometry={里geo} material={里mat} frustumCulled={false} />
      <mesh geometry={外geo} material={外mat} frustumCulled={false} renderOrder={9} />
    </group>
  );
};

// ---------- 整个镜头 ----------
const 地方块们 = () => [...坑().留下, ...远地方块()];

const 场景: React.FC<{ 帧: number }> = ({ 帧 }) => {
  const 秒 = 帧 / fps;
  const 刻 = 秒 * 20;
  const 方块们 = useMemo(地方块们, []);
  const 她 = useMemo(() => 她的样子(秒), [秒]);
  const 书 = 书心(她);
  const 心: [number, number] = [书[0], 书[1]];
  const 柱底: V3 = [书[0], 书[1], 书[2] + 参.举书.书大 / 2 + 参.光柱.离书];
  const 调 = 破云调子(帧);
  const 机 = 破云机位(帧);
  const 你 = { ...stevePose([...参.破云站位.你] as V3, 参.破云朝向.你, { headPitch: 参.破云朝向.你仰, sec: 秒 }), armRRoll: 0, armLRoll: 0 };
  const 量 = 雨量(帧);
  return (
    <>
      <方块拼搭 方块们={方块们} 原点={格原点} 群系={参.群系} />
      <Steve pose={你} />
      <MagicalWineFoxEx {...她} />
      <举着的书 心={书} />
      <地光 心={[她位[0], 她位[1], 她位[2] + 0.005]} 大小={阵大小(帧)} />
      <魔法阵 心={[她位[0], 她位[1], 她位[2] + 0.01]} 转={阵转(帧)} 大小={阵大小(帧)} />
      <光柱件 底={柱底} 顶={光柱顶(帧, 柱底[2])} 刻={刻} 透={光柱透(帧)} />
      <云层 心={心} r={洞半径(帧)} 散={散了(帧)} 撞={撞亮(帧)} 色={调.云色} 暖={Math.min(1, 洞半径(帧))} />
      <亮天 心={心} />
      {量 > 0 && <雨 片们={透视雨片们(机.眼)} 刻={刻} 色={混色(参.雨色.平时, '#ffffff', 0.3 * (1 - 量))} 雨量={量} />}
    </>
  );
};

export type 破云画面属性 = {
  /** 歌曲帧 */
  帧: number;
  /** 叠在 3D 上面、整片后期里面的 2D（歌词） */
  叠层?: React.ReactNode;
  后期?: boolean;
};

/** 一整帧（1280×720 页面），自己铺满 */
export const 破云画面: React.FC<破云画面属性> = ({ 帧, 叠层, 后期 = true }) => {
  const 调 = 破云调子(帧);
  return (
    <整片后期 调色={后期 ? 调.后期.调色 : null} 种子={帧}>
      <三渲二画布
        宽={画幅.宽}
        高={画幅.高}
        机位={破云机位(帧)}
        天={调.地平}
        色调={调.色调}
        描边={画布调子('雷雨').描边}
        发光区={破云发光区(帧)}
      >
        <场景 帧={帧} />
      </三渲二画布>
      {叠层}
    </整片后期>
  );
};

/** 照片「光柱破云」：照片帧 那一帧的画面，不带歌词、界面（这个镜头里也没有气泡） */
export const 光柱破云画面: React.FC<{ 后期?: boolean }> = ({ 后期 = true }) => <破云画面 帧={照片帧} 后期={后期} />;
