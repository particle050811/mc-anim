// 门口画布带上身后的地（用户 10-24 问「怎么超平坦背景 合理吗？」）：同 门口.tsx 的 门口画布（天 → 三维的屋子、角色 → 叠层），
//   在天和屋子之间叠远景、中景两层（地点/林间背景.tsx）。门口.tsx 不是本路的，这里另包一层，不改它。
import type React from 'react';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { sideRig } from '../../地点/侧剖面.tsx';
import { SideSectionSky } from '../../地点/天空.tsx';
import { ForestBackdrop } from '../../地点/林间背景.tsx';
import { EntranceCabin } from '../../地点/门口小木屋.tsx';
import { outline as defaultOutline } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { framing as defaultFraming, skyColors, orthoTop, dayTick, defaultSkyArc, biome } from './参数.ts';
import { DoorShading, type DoorCanvasProps } from './门口.tsx';

const scaleColor = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export type ForestDoorCanvasProps = DoorCanvasProps & {
  /** 身后樱花林冒到哪（第 13 句的生长进度 0～1，见 地点/樱花林.ts 的 冒出）；第 14、15 句默认 1（长满） */
  growth?: number;
};

/** 一块 宽 × 高 的定位容器：天、远景、中景、近景三维、叠层 */
export const ForestDoorCanvas: React.FC<ForestDoorCanvasProps> = ({
  width: width = 1280,
  height: height = 720,
  framing = defaultFraming,
  topDepth = orthoTop,
  刻: tick = dayTick,
  arc,
  lightDarkAmp,
  afterimage,
  tone: tone = '夏日白天',
  brightness = 1,
  outlineWidth = defaultOutline.width,
  overlay: overlay,
  children,
  growth = 1,
  biome: biomeName = biome,
  shading,
  ...houseProps
}) => {
  if (width % 2 || height % 2) throw new Error(`林间门口画布的宽高要是偶数：${width}×${height}`);
  const skyArc = arc === null ? undefined : (arc ?? defaultSkyArc(framing, width, height));
  const t = typeof tone === 'string' ? palette[tone] : tone;
  const tint = scaleColor(t.tint, brightness);
  const fullCoverStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: width, height: height };
  return (
    <DoorShading shading={shading}>
      <div style={{ position: 'relative', width: width, height: height, overflow: 'hidden' }}>
        <SideSectionSky framing={framing} width={width} height={height} 色={skyColors} 刻={tick} arc={skyArc} lightDarkAmp={lightDarkAmp} afterimage={afterimage} />
        <ForestBackdrop width={width} height={height} framing={framing} topDepth={topDepth} tint={tint} fogColor={skyColors.horizon} growth={growth} biome={biomeName} />
        <ToonCanvas
          width={width}
          height={height}
          cameraRig={sideRig(framing, topDepth)}
          tint={tint}
          outline={defaultOutline.开 ? { width: outlineWidth, 色: t.outlineColor } : false}
          style={fullCoverStyle}
        >
          <EntranceCabin {...houseProps} biome={biomeName} />
          {children}
        </ToonCanvas>
        {overlay}
      </div>
    </DoorShading>
  );
};
