// 2-拼回 的画面：构图同第 0 镜（启动器、平常取景，光标不在），白光从 55.08 起慢慢退；世界的碎片吸进图标框拼成新合照，回色前整片是灰的，
// 片尾回色那一帧「啪」地回到现实的调子、图标弹一下。白光盖在整片后期外面（纯白，不被调色染蓝），署名再盖在白光上面。歌词这时已经收了（第 15 句在 片尾歌词收 退场）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 段内正片事件帧, 段窗口 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 启动器, 拼到一半, 署名层 } from '../../场/2-启动器/启动器.tsx';
import { 平常取景, 片尾弹, 片尾白光 } from '../../场/2-启动器/编排.ts';
import { 新图标, 旧图标 } from '../../场/2-启动器/图标源.ts';
import 段 from './段.ts';

const 起帧 = 段窗口('2-拼回').起帧;
const 事 = 段内正片事件帧('2-拼回');
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));
const 调 = 色板.现实;
/** 回色前：现实的调色把饱和拉到 0（白光里是黑白的） */
const 灰调色 = { ...调.调色, 饱和: 0 };

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 回色 = f >= 事.片尾回色;
  const 白 = 片尾白光(f, 事.片尾回色);
  return (
    <>
      <整片后期 调色={回色 ? 调.调色 : 灰调色} 种子={起帧 + f}>
        <启动器
          状态={{ 取景: 平常取景, 行态: 0, 光标: null, 图标: 拼到一半(旧图标, 新图标, f), 图标弹: 片尾弹(f, 事.片尾回色) }}
          碎片={{ f, 新: 新图标 }}
        />
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 调.描边 }} 收={事.片尾歌词收} />
      </整片后期>
      {白 > 0 && <AbsoluteFill style={{ background: `rgba(255,255,255,${白})` }} />}
      <署名层 />
      <配乐音轨 song={原声} 段={段} />
    </>
  );
};

export default 画面;
