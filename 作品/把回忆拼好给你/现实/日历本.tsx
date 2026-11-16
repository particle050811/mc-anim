// 桌上立着的倒计时日历，按原版方块的样子搭（像素块.tsx，放在 <像素空间> 里，单位贴图像素）：顶上一条装订，下面一叠纸，正面印「距高考还有 / 大数字 天」。
// 字是本作品的游戏像素字：小字照原版大小（汉字 unihex 半个贴图像素一个点），大数字放大 2 倍（原版 /title 的大字也是整倍放大）。
// 纸叠贴着装订的后边，越吹越薄，正面往里退；顶上看得见的是装订的顶面。
// 飞走的纸（日历.ts 的 飞页们）各画一片：贴图上下压扁（翻着飞），位置吸在整贴图像素上，背面朝外时露纸背。
import type React from 'react';
import type * as THREE from 'three';
import { pixelFont } from '../界面/像素字.ts';
import { realColors } from './色板.ts';
import { newPixelArt, makeTexture, canvasScale, type PixelArt } from './像素图.ts';
import { FrontFace, PixelBox } from './像素块.tsx';
import { calendarSize, paperThickness, pageLayout, flyPose, type FlyingPage } from './日历.ts';

const S = calendarSize;
const textColor = realColors.pageText;

// 一页的正面：纸、上面一行小字、大数字和「天」
const paintPage = (dayNum: number): PixelArt => {
  const p = newPixelArt(S.width, S.pageHeight);
  p.noise(0, 0, S.width, S.pageHeight, realColors.paperColors, 101, [5, 3, 2]);
  const layout = pageLayout(dayNum);
  const smallText = '距高考还有';
  const smallWidth = pixelFont.textWidth(smallText) - 1;
  pixelFont.draw(p.ctx, smallText, { x: Math.round((S.width - smallWidth) / 2) * canvasScale, y: layout.smallTextY * canvasScale }, 0, 0, textColor, canvasScale);
  pixelFont.draw(p.ctx, String(dayNum), { x: layout.数.x * canvasScale, y: layout.数.y * canvasScale }, 0, 0, realColors.countdown, canvasScale * layout.bigTextScale);
  pixelFont.draw(p.ctx, '天', { x: layout.天.x * canvasScale, y: layout.天.y * canvasScale }, 0, 0, textColor, canvasScale);
  return p;
};

// 纸背：比正面亮一点、没有字，外沿一圈暗边（翻过来时和正面分得开）
const paintPaperBack = (): PixelArt => {
  const p = newPixelArt(S.width, S.pageHeight);
  p.noise(0, 0, S.width, S.pageHeight, [realColors.paperBack, realColors.paperColors[2]], 104, [3, 1]);
  p.fillRect(0, 0, S.width, 1, realColors.paperLayer[0]);
  p.fillRect(0, S.pageHeight - 1, S.width, 1, realColors.paperLayer[0]);
  return p;
};

const paintBinding = (width: number, height: number, seed: number, withBottomEdge: boolean): PixelArt => {
  const p = newPixelArt(width, height);
  p.noise(0, 0, width, height, realColors.bindingColors, seed, [4, 3, 2]);
  if (withBottomEdge) p.fillRect(0, height - 1, width, 1, realColors.bindingColors[1]);
  return p;
};

// 贴图按内容缓存：页上的数只有一百种，不必每帧重画
const calendarTextureCache = new Map<string, THREE.Texture>();
const getOrPaint = (cacheKey: string, draw: () => PixelArt) => {
  let t = calendarTextureCache.get(cacheKey);
  if (!t) calendarTextureCache.set(cacheKey, (t = makeTexture(draw())));
  return t;
};
const pageImage = (dayNum: number) => getOrPaint(`页${dayNum}`, () => paintPage(dayNum));
const paperBackImage = () => getOrPaint('纸背', paintPaperBack);
const bindingFront = () => getOrPaint('装订前', () => paintBinding(S.width, S.bindingHeight, 102, true));
const bindingTop = () => getOrPaint('装订顶', () => paintBinding(S.width, S.bindingDepth, 103, false));

export type CalendarBookParams = {
  /** 装订正面的左下前角（贴图像素） */
  x: number;
  y: number;
  z: number;
  /** 最上面那页印的天数（日历.ts 的 日历数） */
  pagesOnTop: number;
  /** 还在空中的纸（日历.ts 的 飞页们） */
  flyPages?: readonly FlyingPage[];
  /** 斜投影里往里一个贴图像素画面上升几个（正交顶面 / N）：飞纸各往前挪一点免得贴在一起，画面上的位置按它补回来，还落在整贴图像素上 */
  oblique: number;
};

export const CalendarBook: React.FC<CalendarBookParams> = ({ x, y, z, pagesOnTop, flyPages = [], oblique }) => {
  const thickness = paperThickness(pagesOnTop);
  const paperY = y + S.bindingDepth - thickness;
  return (
    <group>
      <PixelBox x={x} y={y} z={z + S.pageHeight} width={S.width} depth={S.bindingDepth} height={S.bindingHeight} 前={bindingFront()} topTexture={bindingTop()} />
      <FrontFace x={x} y={paperY} z={z} width={S.width} height={S.pageHeight} image={pageImage(pagesOnTop)} />
      {flyPages.map((sheet, i) => {
        const pose = flyPose(sheet.age, sheet.kind);
        // 绕这张纸的横中线翻：中线跟着飞，压扁后的上下沿落在整贴图像素上。越晚飞的越靠前（往前挪 前 个贴图像素），z 补上 斜 × 前，画面上不动
        const bottomZ = z + Math.round(S.pageHeight / 2 + pose.dz - pose.height / 2);
        const layerOffset = 1 + 0.01 * (i + 1);
        return <FrontFace key={sheet.数} x={x + pose.dx} y={paperY - layerOffset} z={bottomZ + oblique * layerOffset} width={S.width} height={pose.height} image={pose.isBack ? paperBackImage() : pageImage(sheet.数)} />;
      })}
    </group>
  );
};
