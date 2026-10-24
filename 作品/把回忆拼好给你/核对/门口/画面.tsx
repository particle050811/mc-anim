// 门口核对的画面：按视图表一帧画一个视图（场/2-门口 的 门口画布），左上角写视图名。
// 门对比那帧左右各一个半屏、门都在正中。站位标尺那几帧：门外一步站史蒂夫、牌树之间站魔法酒狐（站姿、戴帽、面朝镜头），她头顶冒「˃ʍ˂」气泡、左下聊天栏一行「Steve加入了游戏」，气泡、聊天栏的缩放 = 这一帧的 N；
//   红线标门、箱子、树苗、告示牌的 x，黄线是地面，右边写人占画面高的比例。分屏那帧只画右半屏。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { STEVE, Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFox } from '@库/角色/魔法酒狐.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 女仆气泡, 女仆气泡锚高 } from '@库/界面/女仆气泡.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { 画幅 } from '../../分镜.ts';
import { 成片倍数 as 出片倍数 } from '@engine/三渲二/像素.ts';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 天体位置 } from '../../地点/天体.ts';
import { 门口 } from '../../地点/门口小木屋.tsx';
import { 像素字 } from '../../界面/像素字.ts';
import { 半屏取景, 整屏取景, 正交顶面, 默认天弧, type 门口取景 } from '../../场/2-门口/参数.ts';
import { 门口画布 } from '../../场/2-门口/门口.tsx';
import { 视图们 } from './视图.ts';

const 宽 = 画幅.宽, 高 = 画幅.高;
const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入游戏
/** 魔法酒狐站着戴帽的头顶（格，脚底起）：N = 6 的站位帧上按像素量的帽尖最高那一行（172 像素）。不戴帽量到头发顶是 1.515（MAGICAL_WINE_FOX.headTop） */
const 酒狐帽顶 = 1.79;
const 站位 = { 史蒂夫: 门口.站位.门外一步, 酒狐: 门口.站位.牌树之间 };

const 字 = { position: 'absolute', fontFamily: uiFontFamily, color: '#ffffff', textShadow: '0 1px 2px #000', whiteSpace: 'nowrap' } as const;

const 刻度: React.FC<{ 取景: 门口取景 }> = ({ 取景 }) => {
  const 投 = 侧投影(取景, 宽, 高);
  const 竖 = [
    { x: 门口.门.x, 名: '门 x=0' },
    { x: 门口.箱子[0], 名: `箱子 x=${门口.箱子[0]}` },
    { x: 门口.树苗[0], 名: `树苗 x=${门口.树苗[0]}` },
    { x: 门口.告示牌[0], 名: `告示牌 x=${门口.告示牌[0]}` },
  ];
  const 地 = 投(0, 0).y;
  const 比 = (h: number) => `${((h * 取景.每格) / (高 * 出片倍数)) * 100}`.slice(0, 4);
  return (
    <>
      {竖.map((v) => (
        <React.Fragment key={v.名}>
          <div style={{ position: 'absolute', left: 投(v.x, 0).x - 0.5, top: 0, width: 1, height: 高, background: 'rgba(255,60,60,0.7)' }} />
          <div style={{ ...字, fontSize: 14, left: 投(v.x, 0).x + 4, top: 70 }}>{v.名}</div>
        </React.Fragment>
      ))}
      <div style={{ position: 'absolute', left: 0, top: 地 - 0.5, width: 宽, height: 1, background: 'rgba(255,230,60,0.8)' }} />
      <div style={{ ...字, fontSize: 14, right: 16, top: 地 - 22 }}>地面 z=0（离底 {高 - 地} 页面像素）</div>
      <div style={{ ...字, fontSize: 16, right: 16, top: 12, textAlign: 'right', lineHeight: 1.5 }}>
        <div>一个贴图像素 {取景.每格 / 16} 成片像素 · 一屏 {((宽 * 出片倍数) / 取景.每格).toFixed(1)} × {((高 * 出片倍数) / 取景.每格).toFixed(2)} 格</div>
        <div>史蒂夫 {STEVE.height} 格 = 画面高 {比(STEVE.height)}%</div>
        <div>酒狐戴帽 {酒狐帽顶} 格 = 画面高 {比(酒狐帽顶)}%</div>
      </div>
    </>
  );
};

const 天体轨迹: React.FC<{ 取景: 门口取景 }> = ({ 取景 }) => {
  const 投 = 侧投影(取景, 宽, 高);
  const 弧 = 默认天弧(取景, 宽, 高);
  return (
    <>
      {Array.from({ length: 24 }, (_, i) => {
        const p = 天体位置(i * 1000, 弧).太阳;
        const q = 投(p.x, p.z);
        return (
          <div key={i} style={{ position: 'absolute', left: q.x - 4, top: q.y - 4, width: 8, height: 8, borderRadius: 4, background: p.高 > 0 ? '#ff5050' : '#666' }}>
            <span style={{ ...字, fontSize: 12, left: 10, top: -4 }}>{i}</span>
          </div>
        );
      })}
    </>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 屋 = { 门开: v.门开, 箱子开度: v.箱子开度, 树进度: v.树进度, 告示牌: v.告示牌, 刻: v.刻, 明暗幅度: v.明暗幅度, 调子: v.调子, 顶面: v.顶面 };
  const 取景 = 整屏取景(v.N);
  const N = 取景.每格 / 16;
  const 站 = 门口.站排y;
  const 锚 = 侧投影(取景, 宽, 高, v.顶面 ?? 正交顶面)(站位.酒狐, 女仆气泡锚高(), 站);
  return (
    <AbsoluteFill style={{ background: '#2a2d33' }}>
      {v.门对比 ? (
        [false, true].map((开, i) => (
          <div key={i} style={{ position: 'absolute', left: (i * 宽) / 2, top: 0 }}>
            <门口画布 宽={宽 / 2} 高={高} 取景={半屏取景((宽 / 2) * 出片倍数, 0.5)} {...屋} 门开={开} />
            <div style={{ ...字, left: 16, top: 60, fontSize: 20 }}>{开 ? '门开' : '门关'}</div>
          </div>
        ))
      ) : v.半屏 ? (
        <div style={{ position: 'absolute', left: 宽 / 2, top: 0 }}>
          <门口画布 宽={宽 / 2} 高={高} 取景={半屏取景((宽 / 2) * 出片倍数, v.半屏.门在)} {...屋} />
        </div>
      ) : (
        <门口画布
          {...屋}
          取景={取景}
          叠层={
            v.标尺 && (
              <>
                <女仆气泡 锚={锚} 缩放={N} 文字="˃ʍ˂" 字体={像素字} 锚对齐={N} />
                <像素聊天栏 lines={[{ text: 'Steve加入了游戏', color: 黄, 起刻: 0 }]} 刻={0} 缩放={N} 字体={像素字} 宽={宽} 高={高} />
                <刻度 取景={取景} />
              </>
            )
          }
        >
          {v.标尺 && (
            <描边>
              <Steve pose={stevePose([站位.史蒂夫, 站, 0], 180)} />
              <MagicalWineFox pose={{ ...standPose([站位.酒狐, 站, 0]), yaw: 180 }} 姿势="站" />
            </描边>
          )}
        </门口画布>
      )}
      {v.天体轨迹 && <天体轨迹 取景={取景} />}
      <div style={{ ...字, left: 16, top: 12, fontSize: 22 }}>核对-门口 · {v.名}</div>
    </AbsoluteFill>
  );
};

export default 画面;
