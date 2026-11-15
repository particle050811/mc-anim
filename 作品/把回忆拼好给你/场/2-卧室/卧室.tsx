// 卧室这一场的画布：三渲二画布（平涂、正交像素机位带俯角）里放小木屋卧室和窗光，背景就是后窗里、屋外那一小截看得见的天色。
// 角色放 children（Z 朝上，坐标同 地点/小木屋卧室布局.ts）。整片后期、歌词在段里包。
// 开光影时窗光不画光斑（窗光.tsx），月光、晨光由光影层从剖掉的南墙那扇窗照进来：南墙只挡光、不上画面（engine/三渲二/光影/只挡光.tsx）。
// 结尾横移出屋（给 屋外）时，东墙外是早上的天和林间背景（同门口身后那片地，地点/林间背景.tsx）：用户 10-24 问「怎么超平坦背景 合理吗？」，
//   原来屋外是一整块平涂的日出橙和一大片草地顶面。后窗里那块天色盖在上面、跟着横移淡掉（天亮），淡完和屋外是同一片天。
import type React from 'react';
import { ToonCanvas, shadingScope } from '@engine/三渲二/画布.tsx';
import { ShadowOnly } from '@engine/三渲二/光影/只挡光.tsx';
import type { ShadingSceneParams, ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import type { Tone } from '@engine/三渲二/调子.ts';
import { sideRig, sideProjection, type SideFraming } from '../../地点/侧剖面.tsx';
import { SideSectionSky, type SkyColors } from '../../地点/天空.tsx';
import { ForestBackdrop } from '../../地点/林间背景.tsx';
import { eastWallOuterEdge, bedroom, CabinBedroom, outsideZone, doorOutsideZone } from '../../地点/小木屋卧室.tsx';
import { outline as defaultOutline, pixelCount } from '../../画风.ts';
import { bedroomRes, bedroomFraming, bedroomTop, type WindowLevel } from './参数.ts';
import { WindowLight } from './窗光.tsx';

/** 屋外（结尾横移出屋时）：亮 = 后窗那块天色淡掉多少（0～1）；色调 = 林子的平涂色调；天色、刻、群系 同门口（场/2-门口/参数.ts，段里给）；
 *  生长、林偏、天每格 见 地点/林间背景.tsx 和 段/2-空床/编排.ts */
export type BedroomOutside = { bright: number; tint: string; skyColors: SkyColors; 刻: number; 群系: string; growth: number; forestOffset: number; skyPerCell: number };

export type BedroomCanvasProps = {
  宽?: number;
  高?: number;
  /** 默认 参数.ts 的 卧室取景（N = 26）；结尾横移时段里传挪过的 */
  framing?: SideFraming;
  topDepth?: number;
  /** 3D 的调子：平涂色调、描边色从这里取 */
  tone: Tone;
  /** 背景（后窗里、屋外的天）；默认用调子的天 */
  天?: string;
  /** 这一档窗光（几束光，空 = 没有光斑） */
  光: WindowLevel;
  /** 天亮了：门外（过道、门板、门洞里那截墙）照原色画、不乘调子；有 屋外 时东墙外也是 */
  outsideLit?: boolean;
  /** 结尾横移出屋时给：东墙外画早上的天和林子 */
  outside?: BedroomOutside;
  /** 光影的样式：不给 = 不开（画 光 那几档光斑）。开了 光 不画，光从南窗照进来，月亮、太阳在哪、照进来几成看 光影场 */
  shading?: ShadingOptions;
  shadingScene?: ShadingSceneParams;
  /** 屋外的林子（屋外 给了才画）开不开光影、太阳在哪：接下一段的屋外，照下一段的给 */
  outsideShading?: { shading?: ShadingOptions; shadingScene?: ShadingSceneParams };
  children?: React.ReactNode;
};

/** 剖掉的南墙只留那扇窗（x、z 照 卧室.南窗）：左右到过道西头、东墙外沿，上下盖过屋顶、地面剖面（屋外不挡，横移出屋时屋外的地照得到太阳）。
 *  厚 1/16 格，同窗光.tsx 只看墙内面那一层：一整格厚时窗洞太深，第一档那种陡的月光进不来，地上没有光斑 */
const southWallThick = 1 / 16;
const southWallBoxes = (() => {
  const { x0, x1, z0, z1 } = bedroom.southWindow;
  const west = -3, east = eastWallOuterEdge, bottom = -15, topEdge = 6;
  return [
    [west, x0, bottom, topEdge],
    [x1, east, bottom, topEdge],
    [x0, x1, bottom, z0],
    [x0, x1, z1, topEdge],
  ] as const;
})();

const SouthWall: React.FC = () => (
  <ShadowOnly>
    {southWallBoxes.map(([a, b, c, d], i) => (
      <mesh key={i} position={[(a + b) / 2, -southWallThick / 2, (c + d) / 2]}>
        <boxGeometry args={[b - a, southWallThick, d - c]} />
        <meshBasicMaterial />
      </mesh>
    ))}
  </ShadowOnly>
);

export const BedroomCanvas: React.FC<BedroomCanvasProps> = ({ 宽: width = 1280, 高: height = 720, framing = bedroomFraming, topDepth = bedroomTop, tone: t, 天: sky, 光: windowLights, outsideLit = false, outside, shading, shadingScene, outsideShading, children }) => {
  const project = sideProjection(framing, width, height, topDepth);
  const glowRegions = outsideLit ? (outside ? [...doorOutsideZone, outsideZone] : doorOutsideZone) : undefined;
  // 天的渐变照 天每格 的像素大小算（地面线同近景），不照卧室 N = 26：那样一屏只有渐变底下那一截，整片是地平色
  const skyFraming: SideFraming | undefined = outside && { 中心: [0, ((project(0, 0).y - height / 2) * 2) / outside.skyPerCell], pxPerCell: outside.skyPerCell };
  return (
    <div style={{ position: 'relative', width: width, height: height, overflow: 'hidden' }}>
      {outside && skyFraming && (
        <shadingScope.Provider value={outsideShading ?? {}}>
          <SideSectionSky framing={skyFraming} 宽={width} 高={height} 色={outside.skyColors} 刻={outside.刻} />
          <ForestBackdrop
            宽={width}
            高={height}
            framing={framing}
            topDepth={topDepth}
            tint={outside.tint}
            fogColor={outside.skyColors.horizon}
            growth={outside.growth}
            群系={outside.群系}
            alignment={{ nearRow: 1, forestOffset: outside.forestOffset }}
          />
          <div
            style={{ position: 'absolute', left: 0, top: 0, width: Math.max(0, project(eastWallOuterEdge, 0).x), height: height, background: sky ?? t.天, opacity: 1 - outside.bright }}
          />
        </shadingScope.Provider>
      )}
      <ToonCanvas
        宽={width}
        高={height}
        cameraRig={sideRig(framing, topDepth)}
        天={outside ? undefined : (sky ?? t.天)}
        tint={t.tint}
        glowRegions={glowRegions}
        outline={defaultOutline.开 ? { 宽: (bedroomRes * defaultOutline.宽) / pixelCount, 色: t.outlineColor } : false}
        shading={shading}
        shadingScene={shadingScene}
        style={outside ? { position: 'absolute', left: 0, top: 0, width: width, height: height } : undefined}
      >
        <CabinBedroom outsideLit={outsideLit} />
        {shading ? (
          <SouthWall />
        ) : (
          windowLights.map((b, i) => <WindowLight key={`${i}-${b.从}`} 从={b.从} lightDir={b.lightDir} colorScale={b.colorScale} />)
        )}
        {children}
      </ToonCanvas>
    </div>
  );
};
