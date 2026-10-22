// 放音效：照 段.ts 里资产是 资产 的 cue 在母版里出声，帧、帧数、入点秒、增益都取 cue，母版和 cue（成片截接、剪辑包读的）就对得上。
// 用法：画面里放 <音效轨 src={import 进来的 asset: 地址} 资产="音效/…" 段={段} />。和 配乐音轨.tsx 一样，cue 不变速、不循环。
// 不用 engine/audio/游戏音效.tsx：那个模块静态 import 了几百个音效，往里加一个，用到它的应力转动段指纹都会变。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { useFirstVisibleFrame, useSfxLog } from '@engine/audio/音效清单.ts';
import { cue增益, type 段定义, type 资产cue, type 声音cue } from '@engine/段/段定义.ts';

const 放一条: React.FC<{ src: string; cue: 资产cue }> = ({ src, cue }) => {
  const { fps } = useVideoConfig();
  const 记 = useSfxLog('音效清单');
  const 外露 = useFirstVisibleFrame();
  if ((cue.速率 ?? 1) !== 1 || cue.循环) throw new Error(`${cue.资产} 第 ${cue.帧} 帧的 cue 变速或循环了，音效轨不支持`);
  const 入点秒 = cue.入点秒 ?? 0;
  const 增益 = (f: number) => cue增益(cue, f);
  记({ 名: cue.名, 文件: cue.资产, from: cue.帧, 帧数: cue.帧数, 入点秒, 速率: 1, 循环: false, gainAt: 增益 });
  // 外面的 Sequence 带 trimBefore 时声音从 外露 那帧才露出来，Remotion 给 volume 的帧从露出来那帧数起（见 音效清单.ts）
  const 跳 = Math.max(0, 外露 - cue.帧);
  return (
    <Sequence from={cue.帧} durationInFrames={cue.帧数} layout="none" name={cue.名}>
      <Audio src={src} trimBefore={入点秒 * fps} volume={(f) => 增益(f + 跳)} />
    </Sequence>
  );
};

/** 段里资产是 资产 的 cue 全放出来；一条都没有就报错（放了组件却没写 cue，成片和剪辑包里会没有这个声音） */
export const 音效轨: React.FC<{ src: string; 资产: string; 段: 段定义 }> = ({ src, 资产, 段 }) => {
  const 条们 = (段.声音 ?? []).filter((c: 声音cue): c is 资产cue => c.资产 === 资产);
  if (!条们.length) throw new Error(`段.ts 里没有放 ${资产} 的 cue`);
  return (
    <>
      {条们.map((c) => (
        <放一条 key={c.帧} src={src} cue={c} />
      ))}
    </>
  );
};
