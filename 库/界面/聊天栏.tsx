// 原版聊天栏（没打开聊天框时）：照 1.20.1 `ChatComponent.render` 反汇编（client srg jar），几何用 GUI 像素、乘 s。
// - 最新一行的下沿离画面底边 40（让出物品栏），往上每行 9；底板 x 0～332（聊天宽 320 加边距），黑色，不透明度 = 0.5（默认文字背景）× 淡出系数。
// - 文字 x 4，原版阴影；系统消息左边 x 0～2 一条 #D0D0D0 竖条（`GuiMessageTag.system()` 和 `systemSinglePlayer()` 同色），透明度跟文字。
// - 寿命：淡出系数 = clamp((1 − 年龄/200) × 10, 0, 1)²，满亮 180 刻，之后 20 刻淡掉；没有淡入。年龄按整刻算（游戏用整数刻数相减）。
//   文字不透明度 int(255 × 系数)，≤ 3 时整行（连底板）不画：字体把 alpha < 4 当成不透明，所以原版跳过这几刻，最后一刻亮着的是第 197 刻。
// 不折行（原版超过 320 会折），最多 10 行（没打开聊天框时默认高度）。字号、字体照 基础.tsx 的 Tooltip（用户 09-30 定的界面规矩）。
import React from 'react';
import { chatColors, UiText } from './基础.tsx';

// 原版 `ChatFormatting` 里聊天会用到、基础.tsx 没有的（基础.tsx 的 green 是铁砧的另一种绿）
export const 聊天色 = {
  green: '#55FF55',
  darkPurple: '#AA00AA',
  lightPurple: chatColors.lightPurple,
};

export type ChatSpan = { text: string; color?: string };
// text：一段字，或几段不同颜色的字；color：整行默认颜色（不写是白）；起刻：进聊天栏的刻，和 ChatOverlay 的 刻 同一个钟；
// 系统：系统消息带左边竖条（默认带），玩家发言写 false
export type ChatLine = { text: string | ChatSpan[]; color?: string; 起刻: number; 系统?: boolean };

export const 聊天行透明度 = (年龄: number): { 字: number; 底: number } | null => {
  if (年龄 < 0 || 年龄 >= 200) return null;
  const k = Math.min(1, Math.max(0, (1 - 年龄 / 200) * 10)) ** 2;
  const 字 = Math.trunc(255 * k);
  if (字 <= 3) return null;
  return { 字: 字 / 255, 底: Math.trunc(255 * k * 0.5) / 255 };
};

// 成就广播进聊天栏的那一行（`PlayerAdvancements.award`，成就开了 announce_to_chat 时发系统消息 chat.type.advancement.<种类>）。
// 文字照原版 zh_cn（1.20.1 的 assets 索引 5）；标题套 chat.square_brackets「[%s]」，连方括号一起按 `FrameType` 上色：task、goal 绿，challenge 深紫；玩家名不带颜色。
const 成就模板 = { task: '%s取得了进度%s', goal: '%s达成了目标%s', challenge: '%s完成了挑战%s' } as const;
export const 成就聊天行 = (玩家: string, 标题: string, 种类: keyof typeof 成就模板, 起刻: number): ChatLine => {
  const [前, 中, 后] = 成就模板[种类].split('%s');
  const 标题色 = 种类 === 'challenge' ? 聊天色.darkPurple : 聊天色.green;
  const spans: ChatSpan[] = [{ text: 前 }, { text: 玩家 }, { text: 中 }, { text: `[${标题}]`, color: 标题色 }, { text: 后 }];
  return { text: spans.filter((sp) => sp.text), 起刻 };
};

const 最多行 = 10;

// 刻：当前时刻（刻，可带小数）；s：GUI 缩放。放在和画面一样大的绝对定位容器里，自己贴左下角
export const ChatOverlay: React.FC<{ lines: ChatLine[]; 刻: number; s: number }> = ({ lines, 刻: tick, s }) => {
  // 同一刻进来的按数组顺序，后进的更新、在下面
  const 已进 = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.起刻 <= tick)
    .sort((a, b) => b.line.起刻 - a.line.起刻 || b.i - a.i)
    .slice(0, 最多行);
  const fs = 8.6 * s;
  return (
    <>
      {已进.map(({ line, i }, 第几行) => {
        const a = 聊天行透明度(Math.floor(tick) - Math.floor(line.起刻));
        if (!a) return null;
        const spans = typeof line.text === 'string' ? [{ text: line.text }] : line.text;
        return (
          <div key={i} style={{ position: 'absolute', left: 0, bottom: (40 + 第几行 * 9) * s, width: 332 * s, height: 9 * s, background: `rgba(0,0,0,${a.底})` }}>
            {line.系统 !== false && <div style={{ position: 'absolute', left: 0, top: 0, width: 2 * s, height: 9 * s, background: `rgba(208,208,208,${a.字})` }} />}
            {/* 原版文字从行顶往下 1 像素起画，字形占下面 8 像素 */}
            <div style={{ position: 'absolute', left: 4 * s, top: s, height: 8 * s, display: 'flex', alignItems: 'center', opacity: a.字 }}>
              {spans.map((sp, k) => (
                <UiText key={k} fontSize={fs} color={sp.color ?? line.color ?? chatColors.white} style={{ lineHeight: 1 }}>
                  {sp.text}
                </UiText>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
};
