// 战斗界面：亚波伦的 boss 血条和名字（照启示录）、法术名签和计数「n / 71」（本片原创）、聊天栏的死亡消息（库/界面/聊天栏.tsx 现成件）。
// 血条照 RevelationFix 4.9 的 ApollyonBossbar.renderFullNetherApollyonBar → renderFullSecondPhase（下界、二阶段、完整版，配置 useSimpleApollyonBossbar 默认关）反汇编：
//   条的左上角 x = 屏宽/2 − 100 − (248 − 200)/2，y = 12（Goety BossBarEvent 给的 getY，第一条 boss 条）；贴图 boss_bar.png 256×256。
//   底槽 blit(x − 1 + 13, y + 29, uv 13,235, 222×7)；血 blit(同位置, uv 13,215, 宽 int(血比 × 222), 高 7)；弓形框 blit(x − 1, y, uv 0,137, 248×66)，这个顺序。
//   名字和称号 drawFullBossName：字放大 1.25 倍，顶在 y + 5；名字右边缘在 屏宽/2 − 2 − 30，称号左边缘在 屏宽/2 − 2 + 30（让开正中的徽记）。
//   字色：ModChatFormatting.APOLLYON（代码 q）在 DissolveApollyonFont 里换成 0xAA0000。
// 没做的（游戏里有）：血上面那层加色的「宇宙」流动（cosmic 着色器，drawCosmicHealth 的第二步，不透明度 (1 − 受击) × 0.7）、受击闪（BossBarHitEffect）、
//   名字的溶解烟边（dissolve_text 着色器，三遍叠画）。所以这里的血是贴图上那一条的静态样子，名字是实心的暗红字。
// 简版（配置开着时的 renderSimpleSecondPhase，boss_bar_simple.png）：底槽、血同上（y + 3），框 blit(x, y, uv 0,163, 248×19)，名字是居中一行白字在 y + 16。留作对照。
// 字用系统中文字体（库/界面/基础.tsx 的 UiText，同聊天栏），不是游戏的像素字。
import React, { useLayoutEffect, useRef } from 'react';
import { png, type Png } from '@engine/model/贴图.ts';
import { chatColors, PixelSprite, UiText } from '@库/界面/基础.tsx';
import type { ChatLine } from '@库/界面/聊天栏.tsx';
import 血条图 from 'asset:贴图/界面/亚波伦血条/boss_bar';
import 简版图 from 'asset:贴图/界面/亚波伦血条/boss_bar_simple';
import { 法术表 } from '../法术/法术表.ts';
import { 聚晶图标 } from '../物品/聚晶图标.ts';
import { 聚晶键 } from './轮盘法术.ts';

/** 贴图上的一块，逐像素放大（不糊）。宽 可以比 uv 块窄（血条按血量截） */
const 贴图块: React.FC<{ 图: Png; u: number; v: number; 宽: number; 高: number; 左: number; 上: number; s: number }> = ({ 图, u, v, 宽, 高, 左, 上, s }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || 宽 <= 0) return;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(宽, 高);
    for (let y = 0; y < 高; y++) img.data.set(图.px.subarray(((v + y) * 图.w + u) * 4, ((v + y) * 图.w + u + 宽) * 4), y * 宽 * 4);
    ctx.putImageData(img, 0, 0);
  }, [图, u, v, 宽, 高]);
  if (宽 <= 0) return null;
  return <canvas ref={ref} width={宽} height={高} style={{ position: 'absolute', left: 左 * s, top: 上 * s, width: 宽 * s, height: 高 * s, imageRendering: 'pixelated' }} />;
};

export const 亚波伦名 = '亚波伦';
/** title.goety.13（启示录 zh_cn；游戏里血量剩最后 1/14 才是它，本片开场就挂，分镜第 3 节） */
export const 亚波伦称号 = '末日终结';
const 名字色 = '#AA0000';

export type 血条属性 = {
  /** 画面宽（像素）和 GUI 缩放 */
  宽: number;
  s: number;
  /** 血量比例 0～1 */
  血比: number;
  /** 完整 = 游戏默认的弓形框（默认）；简版 = 配置 useSimpleApollyonBossbar 开着时的窄条 */
  款?: '完整' | '简版';
  名?: string;
  称号?: string;
  /** 整个淡入淡出（游戏里没有，出场用） */
  透明度?: number;
};

export const 亚波伦血条: React.FC<血条属性> = ({ 宽, s, 血比, 款 = '完整', 名 = 亚波伦名, 称号 = 亚波伦称号, 透明度 = 1 }) => {
  const 屏宽 = 宽 / s;
  const x = Math.floor(屏宽 / 2) - 100 - 24;
  const y = 12;
  const 血宽 = Math.max(0, Math.min(222, Math.trunc(血比 * 222)));
  const fs = 8.6 * s * 1.25;
  if (款 === '简版') {
    const 图 = png(简版图);
    return (
      <div style={{ position: 'absolute', inset: 0, opacity: 透明度 }}>
        <贴图块 图={图} u={13} v={235} 宽={222} 高={7} 左={x + 13} 上={y + 3} s={s} />
        <贴图块 图={图} u={13} v={215} 宽={血宽} 高={7} 左={x + 13} 上={y + 3} s={s} />
        <贴图块 图={图} u={0} v={163} 宽={248} 高={19} 左={x} 上={y} s={s} />
        <div style={{ position: 'absolute', left: 0, width: 宽, top: (y + 16) * s, display: 'flex', justifyContent: 'center' }}>
          <UiText fontSize={8.6 * s} style={{ lineHeight: 1 }}>{`${名} ${称号}`}</UiText>
        </div>
      </div>
    );
  }
  const 图 = png(血条图);
  const 中 = Math.floor(屏宽 / 2) - 2;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 透明度 }}>
      <div style={{ position: 'absolute', right: 宽 - (中 - 30) * s, top: (y + 5) * s }}>
        <UiText fontSize={fs} color={名字色} style={{ lineHeight: 1 }}>{名}</UiText>
      </div>
      <div style={{ position: 'absolute', left: (中 + 30) * s, top: (y + 5) * s }}>
        <UiText fontSize={fs} color={名字色} style={{ lineHeight: 1 }}>{称号}</UiText>
      </div>
      <贴图块 图={图} u={13} v={235} 宽={222} 高={7} 左={x - 1 + 13} 上={y + 29} s={s} />
      <贴图块 图={图} u={13} v={215} 宽={血宽} 高={7} 左={x - 1 + 13} 上={y + 29} s={s} />
      <贴图块 图={图} u={0} v={137} 宽={248} 高={66} 左={x - 1} 上={y} s={s} />
    </div>
  );
};

// ── 法术名签（原创，朴素：黑底一行，16×16 的聚晶图标加法术中文名；样式借原版物品提示框的底色，不画紫边） ──

/** 名签上的字：法术表的中文名去掉「聚晶」两个字（zh_cn 的物品名是「火球聚晶」，法术叫「火球」）；表里没有就原样返回键 */
export const 法术名 = (键: string): string => {
  const 法 = 法术表.find((f) => 聚晶键(f) === 键);
  return 法 ? 法.中文名.replace(/聚晶$/, '') : 键;
};

/** 名签留多久、怎么淡：共 0.8 秒（分镜第 3 节），头 0.08 秒淡入、尾 0.2 秒淡出；不在这段时间里返回 0 */
export const 名签秒 = 0.8;
export const 名签透明度 = (年龄秒: number): number => {
  if (年龄秒 < 0 || 年龄秒 >= 名签秒) return 0;
  return Math.min(1, 年龄秒 / 0.08, (名签秒 - 年龄秒) / 0.2);
};

export type 名签 = {
  /** 聚晶键（goety:fireball_focus），图标和名字都从它来 */
  键: string;
  /** 名签左上角在画面上的位置（像素）：挂在出手点或落点旁，由段投影好给进来 */
  x: number;
  y: number;
  /** 出手后过了几秒 */
  年龄秒: number;
};

export const 法术名签: React.FC<名签 & { s: number }> = ({ 键, x, y, 年龄秒, s }) => {
  const a = 名签透明度(年龄秒);
  if (a <= 0) return null;
  const 地址 = (聚晶图标 as Record<string, string | undefined>)[键];
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: a, display: 'flex', alignItems: 'center', gap: 3 * s, background: 'rgba(16,0,16,0.78)', padding: `${2 * s}px ${4 * s}px ${2 * s}px ${2 * s}px`, borderRadius: 1.5 * s }}>
      {地址 && <PixelSprite tex={png(地址)} size={16 * s} />}
      <UiText fontSize={8.6 * s} style={{ lineHeight: 1 }}>{法术名(键)}</UiText>
    </div>
  );
};

// ── 计数「n / 71」（原创）：右上角，和血条错开 ──
export const 法术计数: React.FC<{ n: number; 总?: number; s: number; 透明度?: number }> = ({ n, 总 = 71, s, 透明度 = 1 }) => (
  <div style={{ position: 'absolute', right: 8 * s, top: 8 * s, opacity: 透明度, background: 'rgba(0,0,0,0.5)', padding: `${2 * s}px ${5 * s}px`, borderRadius: 1.5 * s }}>
    <UiText fontSize={8.6 * s * 1.5} style={{ lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{`${n} / ${总}`}</UiText>
  </div>
);

// ── 死亡消息（聊天栏：<ChatOverlay lines={[死亡消息行(...)]} 刻 s />） ──
/**
 * 聊天栏里的死亡消息一行。默认文字照原版 zh_cn 的 death.attack.mob「%1$s被%2$s杀死了」：史蒂夫到底死于哪种伤害来源没核
 * （炼狱结界的伤害来源在 DeathPerformance.damageSourcesFromForge 里是一串，分镜第 13 节），核实后改 模板 就行。原版死亡消息是白字的系统消息
 */
export const 死亡消息行 = (起刻: number, { 死者 = 'Steve', 凶手 = 亚波伦名, 模板 = '%1$s被%2$s杀死了' }: { 死者?: string; 凶手?: string; 模板?: string } = {}): ChatLine => ({
  text: 模板.replace('%1$s', 死者).replace('%2$s', 凶手),
  color: chatColors.white,
  起刻,
});

export type 战斗界面属性 = {
  宽: number;
  高: number;
  s: number;
  /** 不给不画血条 */
  血条?: Omit<血条属性, '宽' | 's'>;
  /** 不给不画计数 */
  计数?: { n: number; 总?: number; 透明度?: number };
  名签们?: readonly 名签[];
  children?: React.ReactNode;
};

/** 血条、计数、名签一起摆：放在和画面一样大的容器里。聊天栏另用 库/界面/聊天栏.tsx 的 <ChatOverlay>（可以当 children 放进来） */
export const 战斗界面: React.FC<战斗界面属性> = ({ 宽, 高, s, 血条, 计数, 名签们 = [], children }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }}>
    {血条 && <亚波伦血条 宽={宽} s={s} {...血条} />}
    {计数 && <法术计数 s={s} {...计数} />}
    {名签们.map((签, i) => (
      <法术名签 key={`${签.键}-${i}`} {...签} s={s} />
    ))}
    {children}
  </div>
);
