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
import bossBarPng from 'asset:贴图/界面/亚波伦血条/boss_bar';
import bossBarSimplePng from 'asset:贴图/界面/亚波伦血条/boss_bar_simple';
import { spellTable } from '../法术/法术表.ts';
import { focusIcons } from '../物品/聚晶图标.ts';
import { focusKey } from './轮盘法术.ts';

/** 贴图上的一块，逐像素放大（不糊）。宽 可以比 uv 块窄（血条按血量截） */
const TextureBlock: React.FC<{ image: Png; u: number; v: number; width: number; height: number; left: number; 上: number; s: number }> = ({ image: image, u, v, width: width, height: height, left, 上: top, s }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || width <= 0) return;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) img.data.set(image.px.subarray(((v + y) * image.w + u) * 4, ((v + y) * image.w + u + width) * 4), y * width * 4);
    ctx.putImageData(img, 0, 0);
  }, [image, u, v, width, height]);
  if (width <= 0) return null;
  return <canvas ref={ref} width={width} height={height} style={{ position: 'absolute', left: left * s, top: top * s, width: width * s, height: height * s, imageRendering: 'pixelated' }} />;
};

export const yaBoLunName = '亚波伦';
/** title.goety.13（启示录 zh_cn；游戏里血量剩最后 1/14 才是它，本片开场就挂，分镜第 3 节） */
export const yaBoLunTitle = '末日终结';
const nameColor = '#AA0000';

export type BossBarProps = {
  /** 画面宽（像素）和 GUI 缩放 */
  width: number;
  s: number;
  /** 血量比例 0～1 */
  healthRatio: number;
  /** 完整 = 游戏默认的弓形框（默认）；简版 = 配置 useSimpleApollyonBossbar 开着时的窄条 */
  variant?: '完整' | '简版';
  name?: string;
  title?: string;
  /** 整个淡入淡出（游戏里没有，出场用） */
  opacity?: number;
};

export const YaBoLunHealthBar: React.FC<BossBarProps> = ({ width: width, s, healthRatio, variant = '完整', name: name = yaBoLunName, title = yaBoLunTitle, opacity = 1 }) => {
  const screenWidth = width / s;
  const x = Math.floor(screenWidth / 2) - 100 - 24;
  const y = 12;
  const barWidth = Math.max(0, Math.min(222, Math.trunc(healthRatio * 222)));
  const fs = 8.6 * s * 1.25;
  if (variant === '简版') {
    const image = png(bossBarSimplePng);
    return (
      <div style={{ position: 'absolute', inset: 0, opacity: opacity }}>
        <TextureBlock image={image} u={13} v={235} width={222} height={7} left={x + 13} 上={y + 3} s={s} />
        <TextureBlock image={image} u={13} v={215} width={barWidth} height={7} left={x + 13} 上={y + 3} s={s} />
        <TextureBlock image={image} u={0} v={163} width={248} height={19} left={x} 上={y} s={s} />
        <div style={{ position: 'absolute', left: 0, width: width, top: (y + 16) * s, display: 'flex', justifyContent: 'center' }}>
          <UiText fontSize={8.6 * s} style={{ lineHeight: 1 }}>{`${name} ${title}`}</UiText>
        </div>
      </div>
    );
  }
  const image = png(bossBarPng);
  const centerX = Math.floor(screenWidth / 2) - 2;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: opacity }}>
      <div style={{ position: 'absolute', right: width - (centerX - 30) * s, top: (y + 5) * s }}>
        <UiText fontSize={fs} color={nameColor} style={{ lineHeight: 1 }}>{name}</UiText>
      </div>
      <div style={{ position: 'absolute', left: (centerX + 30) * s, top: (y + 5) * s }}>
        <UiText fontSize={fs} color={nameColor} style={{ lineHeight: 1 }}>{title}</UiText>
      </div>
      <TextureBlock image={image} u={13} v={235} width={222} height={7} left={x - 1 + 13} 上={y + 29} s={s} />
      <TextureBlock image={image} u={13} v={215} width={barWidth} height={7} left={x - 1 + 13} 上={y + 29} s={s} />
      <TextureBlock image={image} u={0} v={137} width={248} height={66} left={x - 1} 上={y} s={s} />
    </div>
  );
};

// ── 法术名签（原创，朴素：黑底一行，16×16 的聚晶图标加法术中文名；样式借原版物品提示框的底色，不画紫边） ──

/** 名签上的字：法术表的中文名去掉「聚晶」两个字（zh_cn 的物品名是「火球聚晶」，法术叫「火球」）；表里没有就原样返回键 */
export const spellName = (key: string): string => {
  const spell = spellTable.find((f) => focusKey(f) === key);
  return spell ? spell.chineseName.replace(/聚晶$/, '') : key;
};

/** 名签留多久、怎么淡：共 0.8 秒（分镜第 3 节），头 0.08 秒淡入、尾 0.2 秒淡出；不在这段时间里返回 0 */
export const nameTagDurSec = 0.8;
export const nameTagAlpha = (nameTagAlpha: number): number => {
  if (nameTagAlpha < 0 || nameTagAlpha >= nameTagDurSec) return 0;
  return Math.min(1, nameTagAlpha / 0.08, (nameTagDurSec - nameTagAlpha) / 0.2);
};

export type NameTag = {
  /** 聚晶键（goety:fireball_focus），图标和名字都从它来 */
  键: string;
  /** 名签左上角在画面上的位置（像素）：挂在出手点或落点旁，由段投影好给进来 */
  x: number;
  y: number;
  /** 出手后过了几秒 */
  ageSec: number;
};

export const SpellNameTag: React.FC<NameTag & { s: number }> = ({ 键: focusKey, x, y, ageSec, s }) => {
  const a = nameTagAlpha(ageSec);
  if (a <= 0) return null;
  const url = (focusIcons as Record<string, string | undefined>)[focusKey];
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: a, display: 'flex', alignItems: 'center', gap: 3 * s, background: 'rgba(16,0,16,0.78)', padding: `${2 * s}px ${4 * s}px ${2 * s}px ${2 * s}px`, borderRadius: 1.5 * s }}>
      {url && <PixelSprite tex={png(url)} size={16 * s} />}
      <UiText fontSize={8.6 * s} style={{ lineHeight: 1 }}>{spellName(focusKey)}</UiText>
    </div>
  );
};

// ── 计数「n / 71」（原创）：右上角，和血条错开 ──
export const SpellCount: React.FC<{ n: number; grandTotal?: number; s: number; opacity?: number }> = ({ n, grandTotal: total = 71, s, opacity = 1 }) => (
  <div style={{ position: 'absolute', right: 8 * s, top: 8 * s, opacity: opacity, background: 'rgba(0,0,0,0.5)', padding: `${2 * s}px ${5 * s}px`, borderRadius: 1.5 * s }}>
    <UiText fontSize={8.6 * s * 1.5} style={{ lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{`${n} / ${total}`}</UiText>
  </div>
);

// ── 死亡消息（聊天栏：<ChatOverlay lines={[死亡消息行(...)]} 刻 s />） ──
/**
 * 聊天栏里的死亡消息一行。默认文字照原版 zh_cn 的 death.attack.mob「%1$s被%2$s杀死了」：史蒂夫到底死于哪种伤害来源没核
 * （炼狱结界的伤害来源在 DeathPerformance.damageSourcesFromForge 里是一串，分镜第 13 节），核实后改 模板 就行。原版死亡消息是白字的系统消息
 */
export const deathMessageLine = (startTick: number, { victim = 'Steve', killer = yaBoLunName, template = '%1$s被%2$s杀死了' }: { victim?: string; killer?: string; template?: string } = {}): ChatLine => ({
  text: template.replace('%1$s', victim).replace('%2$s', killer),
  color: chatColors.white,
  startTick,
});

export type BattleUiProps = {
  width: number;
  height: number;
  s: number;
  /** 不给不画血条 */
  healthBar?: Omit<BossBarProps, 'width' | 's'>;
  /** 不给不画计数 */
  spellCount?: { n: number; grandTotal?: number; opacity?: number };
  nameTags?: readonly NameTag[];
  children?: React.ReactNode;
};

/** 血条、计数、名签一起摆：放在和画面一样大的容器里。聊天栏另用 库/界面/聊天栏.tsx 的 <ChatOverlay>（可以当 children 放进来） */
export const BattleUi: React.FC<BattleUiProps> = ({ width: width, height: height, s, healthBar, spellCount, nameTags = [], children }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }}>
    {healthBar && <YaBoLunHealthBar width={width} s={s} {...healthBar} />}
    {spellCount && <SpellCount s={s} {...spellCount} />}
    {nameTags.map((nameTag, i) => (
      <SpellNameTag key={`${nameTag.键}-${i}`} {...nameTag} s={s} />
    ))}
    {children}
  </div>
);
