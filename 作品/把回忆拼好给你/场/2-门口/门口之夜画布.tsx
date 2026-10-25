// 第 9–11 句门这个机位的夜里（按歌曲帧画，三句一个镜头）：后面是夜空（地点/天空.tsx，月亮在左上）、星星（跟着天慢慢挪）、
// 屋后的远景（地点/屋后远景.tsx，同第 6–8 句那片地：起伏的地、樱花林、橡树，远处照原版的雾淡进夜空；不开云、不仰、不升，跟着正交那一层走）、烟花的闪光，
// 前面三渲二画布里小木屋（后墙挂着照片墙、门边没有箱子）、树苗、告示牌、你、她、烟花火箭和火花。烟花把近处照亮是演绎：平涂分三档（门口之夜参数.ts 的 亮档），树苗、牌子、你一组，门里的她一组，房子、地面、远景一组，各亮各的。
// 火花、火箭用原版贴图画成朝镜头的方片（不吃平涂），一个贴图像素取偶数个成片像素、中心吸到偶数像素上。闪光（原版 FLASH）画在天上那层，
// 不画平滑光晕：32×32 的光片按 N 的整数倍放大，透明度只留两档硬边（同美术定稿对太阳月亮的口径「最多一两圈硬边色阶」）。
// 捕获：给了 捕获，每帧三维画完以后把天、星星、远景、闪光、三维各层连同在画面上的位置按顺序交给它（第 11 句定格成照片、碎裂用，见 门口之夜照片.tsx）；
//   远景那块画布比画面高、不从画面顶边起，要按位置贴。
import { useFrame } from '@react-three/fiber';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 平涂 } from '@engine/三渲二/平涂.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { ParticleQuads, particleTexture, type Particle } from '@库/特效/粒子面片.tsx';
import { 火箭位置, 烟花染料色, 烟花火花们, 闪光 } from '@库/特效/烟花.ts';
import { fps, 正片事件 } from '../../分镜.ts';
import { 侧机位, 侧投影 } from '../../地点/侧剖面.tsx';
import { 侧剖面天空 } from '../../地点/天空.tsx';
import { 告示牌 } from '../../地点/告示牌.tsx';
import { 告示牌像素字 } from '../../地点/告示牌字.tsx';
import { 樱花树方块 } from '../../地点/樱花树.ts';
import { 照片墙格们 } from '../../地点/照片墙格.ts';
import { 屋后远景 } from '../../地点/屋后远景.tsx';
import { 格原点, 门口, 门口小木屋 } from '../../地点/门口小木屋.tsx';
import { 第8句照片们 } from '../../特效/照片画.ts';
import { 描边 as 描边默认, 像素N } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 天色, 群系 } from './参数.ts';
import { 亮档, 亮档比, 夜刻, 夜天弧, 天取景, 星星, 烟花们, 烟花光掺白, 牌字样式, 镜头, 镜头取景, type 门口之夜镜头 } from './门口之夜参数.ts';
import { 你态, 加挥手, 她态, 摆设态, 站排y } from './门口之夜编排.ts';
import 火箭图 from 'asset:贴图/物品/烟花火箭';
import 树苗图 from 'asset:贴图/物品/樱花树苗';
import 闪光图 from 'asset:贴图/粒子/闪光';
import 火花0 from 'asset:贴图/粒子/火花/0';
import 火花1 from 'asset:贴图/粒子/火花/1';
import 火花2 from 'asset:贴图/粒子/火花/2';
import 火花3 from 'asset:贴图/粒子/火花/3';
import 火花4 from 'asset:贴图/粒子/火花/4';
import 火花5 from 'asset:贴图/粒子/火花/5';
import 火花6 from 'asset:贴图/粒子/火花/6';
import 火花7 from 'asset:贴图/粒子/火花/7';

const 夜 = 色板.夜;
const 手持图 = { 树苗: png(树苗图), 烟花火箭: png(火箭图) } as const;
const 火箭 = png(火箭图);
const 闪光片 = png(闪光图);

// 火花八张 8×8 拼成一条 64×8 的图集，第 n 张在 u ∈ [n/8, (n+1)/8)
const 火花图集 = (() => {
  const 张们 = [火花0, 火花1, 火花2, 火花3, 火花4, 火花5, 火花6, 火花7].map(png);
  const px = new Uint8Array(64 * 8 * 4);
  张们.forEach((p, n) => {
    if (p.w !== 8 || p.h !== 8) throw new Error(`火花贴图 ${n} 不是 8×8：${p.w}×${p.h}`);
    for (let y = 0; y < 8; y++) px.set(p.px.subarray(y * 32, y * 32 + 32), (y * 64 + n * 8) * 4);
  });
  return px;
})();

// ---------- 颜色 ----------
const 拆 = (hex: string): V3 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const 合 = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
/** 这一组在这一档的平涂色调：夜色调往烟花色（掺白）走 比[档] */
const 组色调 = (档: 0 | 1 | 2, 色: V3 | null, 比: readonly number[]) => {
  const t0 = 拆(夜.色调);
  if (!色 || 档 === 0) return 夜.色调;
  const k = 比[档]!;
  return 合(t0.map((v, i) => {
    const c = 色[i]! + (1 - 色[i]!) * 烟花光掺白;
    return v + (c - v) * k;
  }));
};

// ---------- 像素吸附 ----------
/** 场景点吸到镜头的偶数像素上：横 (x − 中心x)·16N、竖 (z + 斜·y − 中心z)·16N 都取偶数 */
const 吸点 = (j: 门口之夜镜头, p: V3): V3 => {
  const k = 16 * j.N;
  const 斜 = j.顶面 / j.N;
  const 偶 = (v: number) => 2 * Math.round(v / 2);
  const x = j.中心[0] + 偶((p[0] - j.中心[0]) * k) / k;
  const 竖 = 偶((p[2] + 斜 * p[1] - j.中心[1]) * k) / k;
  return [x, p[1], 竖 - 斜 * p[1] + j.中心[1]];
};
/** 方片一个贴图像素几个成片像素（偶数）→ 半边长（格）：贴图 边 个像素宽 */
const 方片半 = (j: 门口之夜镜头, 原半: number, 边: number) => {
  const 像 = 2 * Math.max(1, Math.round(((2 * 原半 * 16 * j.N) / 边) / 2));
  return (像 * 边) / (2 * 16 * j.N);
};

// ---------- 烟花：火花、火箭 ----------
const 烟花方片: React.FC<{ 秒: number; 镜: 门口之夜镜头; 火箭色: V3 }> = ({ 秒, 镜, 火箭色 }) => {
  const 图集 = particleTexture(火花图集, 64, 8, 火花图集);
  const 火箭贴图 = particleTexture(火箭.px, 火箭.w, 火箭.h, 火箭);
  const 火花们: Particle[] = [];
  const 火箭们: Particle[] = [];
  for (const 发 of 烟花们) {
    for (const h of 烟花火花们(发, 秒))
      火花们.push({ p: 吸点(镜, h.p), half: 方片半(镜, h.半, 8), uv: [h.贴图 / 8, 0, (h.贴图 + 1) / 8, 1], color: h.色, alpha: h.alpha });
    const p = 火箭位置(发, 秒);
    // 原版 GROUND 显示：半格见方的物品贴图，中心比实体高 0.125 格
    if (p) 火箭们.push({ p: 吸点(镜, [p[0], p[1], p[2] + 0.125]), half: 方片半(镜, 0.25, 16), uv: [0, 0, 1, 1], color: 火箭色 });
  }
  return (
    <>
      <ParticleQuads tex={火箭贴图} items={火箭们} />
      <ParticleQuads tex={图集} items={火花们} translucent depthWrite={false} />
    </>
  );
};

// ---------- 2D 层：星星、闪光 ----------
const 成宽 = (宽: number) => 宽 * 成片倍数;

/** 星星：一张 W×H 的循环图（确定性随机），跟着天挪（偏 = 天取景 的中心比开场那一镜挪了多少成片像素），躲开月亮那一块（开场那一镜里月亮的位置；月亮跟着天走，
 *  到第 12 句只往西挪不到 80 像素） */
const 星星层: React.FC<{ 宽: number; 高: number; 偏: { x: number; y: number }; 月: { x: number; y: number } }> = ({ 宽, 高, 偏, 月 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 成宽(宽), H = 成宽(高);
  const 图 = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    let s = 星星.种子 >>> 0;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    let 放了 = 0;
    for (let 试 = 0; 放了 < 星星.个数 && 试 < 星星.个数 * 20; 试++) {
      const x = 2 * Math.floor((r() * W) / 2);
      const y = 2 * Math.floor((r() * H) / 2);
      const 边 = r() < 0.5 ? 星星.边[0] : 星星.边[1];
      const a = 星星.亮[0] + r() * (星星.亮[1] - 星星.亮[0]);
      if (Math.abs(x - 月.x) < 260 && Math.abs(y - 月.y) < 260) continue;
      ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
      ctx.fillRect(x, y, 边, 边);
      放了++;
    }
    return c;
  }, [W, H, 月.x, 月.y]);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    // 偏移吸到偶数像素、按图的宽高取模，四张拼满
    const 模 = (v: number, m: number) => ((2 * Math.round(v / 2)) % m + m) % m;
    const ox = 模(-偏.x, W), oy = 模(偏.y, H);
    for (const dx of [ox - W, ox]) for (const dy of [oy - H, oy]) ctx.drawImage(图, dx, dy);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};

/** 闪光透明度只留两档硬边：原版透明度（光片 alpha × 0.6～0.725）过 门[i] 就画 值[i]，低于 0.3 的外圈整片不画。
 *  原来按 0.18 一档切，三圈加一个亮心，手机上一眼是一团圆形光晕（核查 10-24）。值 Agent 暂定 */
const 闪光档 = { 门: [0.5, 0.3], 值: [0.34, 0.17] } as const;
const 闪光层: React.FC<{ 宽: number; 高: number; 秒: number; 镜: 门口之夜镜头 }> = ({ 宽, 高, 秒, 镜 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 成宽(宽), H = 成宽(高);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const 发 of 烟花们) {
      const g = 闪光(发, 秒);
      if (!g) continue;
      // 原版 OverlayParticle：边长 7.1·sin((age + pt − 1)·π/4)、alpha 0.6 − (age + pt − 1)·0.125
      const q = g.刻 - 1;
      const 半 = Math.abs(7.1 * Math.sin((q * Math.PI) / 4));
      const alpha = 0.6 - q * 0.125;
      const 格 = Math.max(1, Math.round(半)) * 镜.N; // 一个光片像素几个成片像素：N 的整数倍
      const 心 = 吸点(镜, g.心);
      const k = 16 * 镜.N;
      const cx = W / 2 + (心[0] - 镜.中心[0]) * k;
      const cy = H / 2 - (心[2] + (镜.顶面 / 镜.N) * 心[1] - 镜.中心[1]) * k;
      const [r, gg, b] = g.色.map((v) => Math.round(v * 255));
      for (let y = 0; y < 闪光片.h; y++)
        for (let x = 0; x < 闪光片.w; x++) {
          const a = (闪光片.px[(y * 闪光片.w + x) * 4 + 3]! / 255) * alpha;
          const 档 = a >= 闪光档.门[0] ? 闪光档.值[0] : a >= 闪光档.门[1] ? 闪光档.值[1] : 0;
          if (档 <= 0) continue;
          ctx.fillStyle = `rgba(${r}, ${gg}, ${b}, ${档.toFixed(3)})`;
          ctx.fillRect(Math.round(cx + (x - 闪光片.w / 2) * 格), Math.round(cy + (y - 闪光片.h / 2) * 格), 格, 格);
        }
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};

// ---------- 捕获 ----------
/** 交出去的一层：画布和它在画面上的位置（占整个画面宽高的比例，左上角起） */
export type 捕获层 = { 图: HTMLCanvasElement; 左: number; 上: number; 宽: number; 高: number };
const 捕获器: React.FC<{ 层: React.RefObject<HTMLDivElement | null>; 交: (层们: readonly 捕获层[]) => void }> = ({ 层, 交 }) => {
  // 优先级 2：在 描边渲染（优先级 1，接管画布的渲染，描边关着也是它画）之后，这一帧的三维已经在画布上。
  // 位置用 getBoundingClientRect 量、除以外框：渲染时整页有缩放，比例不受影响
  useFrame(({ gl }) => {
    const 框 = 层.current;
    if (!框) return;
    const R = 框.getBoundingClientRect();
    const 底们 = [...框.querySelectorAll('canvas')].filter((c) => c !== gl.domElement);
    交([...底们, gl.domElement].map((图) => {
      const r = 图.getBoundingClientRect();
      return { 图, 左: (r.left - R.left) / R.width, 上: (r.top - R.top) / R.height, 宽: r.width / R.width, 高: r.height / R.height };
    }));
  }, 2);
  return null;
};

// ---------- 画布 ----------
export type 门口之夜画布属性 = {
  /** 歌曲帧 */
  帧: number;
  宽?: number;
  高?: number;
  /** 每帧画完把各层（天、星星、远景、闪光、三维）连同位置交出来 */
  捕获?: (层们: readonly 捕获层[]) => void;
  style?: React.CSSProperties;
};

export const 门口之夜画布: React.FC<门口之夜画布属性> = ({ 帧, 宽 = 1280, 高 = 720, 捕获, style }) => {
  const 秒 = 帧 / fps;
  const 镜 = 镜头(帧);
  const 取景 = 镜头取景(镜);
  const 层 = useRef<HTMLDivElement>(null);
  const { 档, 发 } = 亮档(秒);
  // 照亮的颜色取这一发的第一种颜色（同原版闪光）
  const 光色 = 发 ? 拆(`#${烟花染料色[发.色们[0]!].toString(16).padStart(6, '0')}`) : null;
  const 近 = 组色调(档, 光色, 亮档比.近);
  const 她色调 = 组色调(档, 光色, 亮档比.她);
  const 远 = 组色调(档, 光色, 亮档比.远);
  const 你 = 你态(帧);
  const 她 = 她态(帧);
  const 摆 = 摆设态(帧);
  const 天 = 天取景(镜);
  const 开天 = 天取景(镜头(正片事件.第9句入夜.帧));
  const 月 = 侧投影(开天, 宽, 高)(夜天弧.心[0], 夜天弧.心[1] + 夜天弧.半径);
  const 树苗 = useMemo(() => 樱花树方块(false, [门口.树苗[0], 1, 0]), []);
  const 照片墙 = useMemo(() => 照片墙格们(第8句照片们), []);
  const 你姿 = 加挥手({ ...stevePose([你.x, 站排y, 0], 你.yaw, { headPitch: 你.头俯仰, holdR: !!你.拿 }), armRRoll: 0, armLRoll: 0 }, 你.挥);
  const 她loc: V3 = [她.x, 站排y, 0];
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden', ...style }}>
      <div ref={层} style={{ position: 'absolute', inset: 0 }}>
        <侧剖面天空 取景={天} 宽={宽} 高={高} 色={天色} 刻={夜刻(秒)} 弧={夜天弧} />
        <星星层
          宽={宽}
          高={高}
          偏={{ x: (天.中心[0] - 开天.中心[0]) * 天.每格, y: (天.中心[1] - 开天.中心[1]) * 天.每格 }}
          月={{ x: 月.x * 成片倍数, y: 月.y * 成片倍数 }}
        />
        {/* 远景的色调同房子、地面那一组（烟花亮的时候一起亮一点）；明暗幅度同 侧剖面天空 的默认。
            远景按这一帧的取景跟着正交那一层走（推到牌子上时林子跟着放大，近处的地才接得上屋前的草地；给 天取景 试过，特写里林子底下露出天）。
            雾按这一帧的取景找背后那一行天色，天却按 天取景 画，两边差一截：雾淡完的远处（172 格外）在这三句里不是在画外就是被近处的林子、房子挡着，看不出 */}
        <屋后远景 取景={取景} 宽={宽} 高={高} 顶面={镜.顶面} 色调={远} 天色={天色} 刻={夜刻(秒)} 明暗幅度={1} />
        {/* 闪光在远景前面：原版 FLASH 是炸点上的粒子，比屋后的地近 */}
        <闪光层 宽={宽} 高={高} 秒={秒} 镜={镜} />
        <三渲二画布
          宽={宽}
          高={高}
          机位={侧机位(取景, 镜.顶面)}
          色调={远}
          描边={描边默认.开 ? { 宽: (镜.N * 描边默认.宽) / 像素N, 色: 夜.描边 } : false}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          {/* 照片墙一格 64 个地图像素：镜头停下来的 N（16、84、12）都是 4 的倍数，一个地图像素是整数个成片像素 */}
          <门口小木屋 门开 群系={群系} 照片墙={照片墙} 照片墙边长={64} />
          <平涂 色调={近}>
            {摆.树苗 && <方块拼搭 方块们={树苗} 原点={格原点} 群系={群系} 正面花草 />}
            <告示牌 位={门口.告示牌}>
              <告示牌像素字 行们={摆.牌上} {...牌字样式} />
            </告示牌>
            {/* 描边组跟着 画风.ts 的 描边.开 走（全片不描边，用户 10-24 定），留着组是为了开关只改一处 */}
            <描边>
              <贴图像素对齐 锚={你姿.loc as V3}>
                <Steve pose={你姿} handR={你.拿 ? <ItemSprite layers={[{ tex: 手持图[你.拿] }]} emissive={0} shadow={false} /> : undefined} />
              </贴图像素对齐>
            </描边>
          </平涂>
          <平涂 色调={她色调}>
            <描边>
              <贴图像素对齐 锚={她loc}>
                <MagicalWineFoxEx
                  pose={{ ...standPose(她loc), yaw: 180 }}
                  姿势="站"
                  表情={她.表情}
                  骨骼={{ Head: { rot: [-她.头[0], -她.头[1], 她.头[2]] } }}
                  眨眼={她.眨眼}
                  秒={秒}
                  背后法杖={false}
                />
              </贴图像素对齐>
            </描边>
          </平涂>
          <烟花方片 秒={秒} 镜={镜} 火箭色={拆(远)} />
          {捕获 && <捕获器 层={层} 交={捕获} />}
        </三渲二画布>
      </div>
    </div>
  );
};
