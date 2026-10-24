// 门口核对的画面：按视图表一帧画一个视图（场/2-门口 的 门口画布），左上角写视图名；站位标尺那帧加灰盒和坐标刻度，分屏那帧只画右半屏。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { 画幅 } from '../../分镜.ts';
import { 出片倍数 } from '../../地点/侧剖面.tsx';
import { 门口 } from '../../地点/门口小木屋.tsx';
import { 门口画布 } from '../../场/2-门口/门口.tsx';
import { 天体位置 } from '../../地点/天体.ts';
import { 半屏取景, 取景, 天弧 } from '../../场/2-门口/参数.ts';
import { 视图们 } from './视图.ts';

const 灰盒: React.FC<{ 脚: V3; 宽: number; 高: number; 色: string }> = ({ 脚, 宽, 高, 色 }) => (
  <mesh position={[脚[0], 脚[1], 脚[2] + 高 / 2]}>
    <boxGeometry args={[宽, 宽, 高]} />
    <meshStandardMaterial color={色} roughness={1} />
  </mesh>
);

const 人高 = { 史蒂夫: 1.875, 酒狐: 1.52 };

// 场景坐标 → 页面像素（1280×720）
const 屏x = (x: number) => 画幅.宽 / 2 + ((x - 取景.中心[0]) * 取景.每格) / 出片倍数;
const 屏y = (z: number) => 画幅.高 / 2 - ((z - 取景.中心[1]) * 取景.每格) / 出片倍数;

const 刻度: React.FC = () => {
  const 竖 = [
    { x: 门口.门.x, 名: '门 x=0' },
    { x: 门口.箱子[0], 名: '箱子 x=1' },
    { x: 门口.树苗[0], 名: '树苗 x=−4' },
    { x: 门口.告示牌[0], 名: '告示牌 x=−2' },
  ];
  const 字 = { position: 'absolute', fontFamily: 'sans-serif', fontSize: 14, color: '#ffffff', textShadow: '0 1px 2px #000', whiteSpace: 'nowrap' } as const;
  return (
    <>
      {竖.map((v) => (
        <React.Fragment key={v.名}>
          <div style={{ position: 'absolute', left: 屏x(v.x) - 0.5, top: 0, width: 1, height: 画幅.高, background: 'rgba(255,60,60,0.7)' }} />
          <div style={{ ...字, left: 屏x(v.x) + 4, top: 70 }}>{v.名}</div>
        </React.Fragment>
      ))}
      <div style={{ position: 'absolute', left: 0, top: 屏y(0) - 0.5, width: 画幅.宽, height: 1, background: 'rgba(255,230,60,0.8)' }} />
      <div style={{ ...字, left: 8, top: 屏y(0) - 20 }}>地面 z=0（离底 {Math.round(画幅.高 - 屏y(0))} 页面像素）</div>
      {[1, 2, 3, 4, 5, 6, 7].map((z) => (
        <div key={z} style={{ ...字, fontSize: 11, left: 4, top: 屏y(z) - 7 }}>
          z={z}
        </div>
      ))}
      <div style={{ ...字, left: 屏x(-1) - 40, top: 屏y(人高.史蒂夫) - 22 }}>史蒂夫 {((人高.史蒂夫 * 取景.每格) / 1440 * 100).toFixed(1)}%</div>
      <div style={{ ...字, left: 屏x(2) - 30, top: 屏y(人高.酒狐) - 22 }}>酒狐 {((人高.酒狐 * 取景.每格) / 1440 * 100).toFixed(1)}%</div>
    </>
  );
};

// 太阳每 1000 刻一个点（整屏默认弧，同 门口内容 的默认），数字是刻 ÷ 1000
const 天体轨迹: React.FC = () => (
  <>
    {Array.from({ length: 24 }, (_, i) => {
      const p = 天体位置(i * 1000, { 心: 天弧.心, 半径: 天弧.半径 }).太阳;
      return (
        <div key={i} style={{ position: 'absolute', left: 屏x(p.x) - 4, top: 屏y(p.z) - 4, width: 8, height: 8, borderRadius: 4, background: p.高 > 0 ? '#ff5050' : '#666', color: '#fff', fontFamily: 'sans-serif', fontSize: 12 }}>
          <span style={{ position: 'absolute', left: 10, top: -4, textShadow: '0 1px 2px #000' }}>{i}</span>
        </div>
      );
    })}
  </>
);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 屋 = { 门开度: v.门开度, 箱子开度: v.箱子开度, 树进度: v.树进度, 告示牌: v.告示牌, 刻: v.刻, 明暗幅度: v.明暗幅度, 亮度: v.亮度 };
  const 站 = 门口.站排y;
  return (
    <AbsoluteFill style={{ background: '#2a2d33' }}>
      {v.半屏 ? (
        <div style={{ position: 'absolute', left: 画幅.宽 / 2, top: 0, width: 画幅.宽 / 2, height: 画幅.高 }}>
          <门口画布 宽={画幅.宽 / 2} 高={画幅.高} 取景={半屏取景((画幅.宽 / 2) * 出片倍数, v.半屏.门在)} {...屋} />
        </div>
      ) : (
        <门口画布 {...屋}>
          {v.标尺 && (
            <>
              <灰盒 脚={[门口.站位.门外一步, 站, 0]} 宽={0.6} 高={人高.史蒂夫} 色="#5b7bd5" />
              <灰盒 脚={[门口.站位.箱子右, 站, 0]} 宽={0.5} 高={人高.酒狐} 色="#e58fc0" />
              <灰盒 脚={[门口.站位.牌树之间, 站, 0]} 宽={0.5} 高={人高.酒狐} 色="#e58fc0" />
            </>
          )}
        </门口画布>
      )}
      {v.标尺 && <刻度 />}
      {v.天体轨迹 && <天体轨迹 />}
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, textShadow: '0 1px 3px #000' }}>核对-门口 · {v.名}</div>
    </AbsoluteFill>
  );
};

export default 画面;
