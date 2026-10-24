// 门口哈气核对的画面：成片里第 8 句 27.80 那一帧（场/2-门口 的 门口画布 + 哈气角色、哈气气泡；取景、调子见 场/2-门口/第8句.ts），按视图表开关描边和整片后期。
// 门开着（她刚从屋里窜出来），箱子开着（四张照片刚放完）；还没种树、没插牌子（第 9 句才种）。不写视图名：静帧就是成片的样子。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 正片事件 } from '../../分镜.ts';
import { 哈气角色, 哈气气泡 } from '../../场/2-门口/哈气.tsx';
import { 取景 as 门口默认取景 } from '../../场/2-门口/参数.ts';
import { 门口画布 } from '../../场/2-门口/门口.tsx';
import { 第8句取景, 第8句调子 } from '../../场/2-门口/第8句.ts';
import { 视图们 } from './视图.ts';

const 秒 = 正片事件.哈气.秒;

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 取景 = v.默认取景 ? 门口默认取景 : 第8句取景();
  return (
    <整片后期 调色={v.后期 ? 第8句调子.调色 : null}>
      <门口画布 门开 箱子开度={1} 调子={第8句调子} 取景={取景} 描边宽={取景.每格 / 16} 叠层={<哈气气泡 取景={取景} />}>
        <哈气角色 秒={秒} 描边={v.描边} />
      </门口画布>
    </整片后期>
  );
};

export default 画面;
