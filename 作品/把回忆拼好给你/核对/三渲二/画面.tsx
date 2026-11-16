// 三渲二核对的画面：按视图表一帧画一个视图。左上角一行原版像素字和一把 16 格的贴图像素尺子，都按 像素N 画，和方块的贴图像素一样大（她的贴图像素约 3.5 像素，对不上，见 她模型像素）；左下角写视图名（不过后期）。
// 待迁移（私有资产）：对照用的游戏截图私有（核对段，不进成片），公开构建缺了怎么降级还没定
import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { useCheckView } from '@engine/段/核对画面.tsx';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { canvasPixel } from '@engine/三渲二/像素.ts';
import { Outline } from '@engine/三渲二/描边.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import type { CameraRigParams } from '@engine/三渲二/机位.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { BlockMesh, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import { drawText, shadowOffset, textWidth } from '@库/界面/像素字.ts';
import { Jiuhu } from '@库/角色/九胡.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MAGICAL_WINE_FOX, MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { toVanillaCoords } from '@engine/model/贴图倍数.ts';
import { Chest, VANILLA_CHEST_TEX } from '@库/物品/箱子.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import houseRaw from 'asset:网格/隐世之境一楼/头';
import houseBin from 'asset:网格/隐世之境一楼/顶点';
import houseAtlas from 'asset:网格/隐世之境一楼/图集';
import shot from 'asset:截图/隐世之境/一楼机位';
import { firstFloor, FirstFloorLighting, hallLamps } from '../../地点/隐世之境一楼.tsx';
import { pixelCount, orthoRig, orthoTop } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { firstFloorRig, sideLookAt, views, perspectiveRig, type View } from './视图.ts';

const houseInfo = houseRaw as unknown as BlockMeshInfo;
const widthPx = 1280;
const height = 720;

// 侧剖面：主厅南头（y < −16）的方块藏掉，切口和导出边补面，裙边只往下补 1 格（屋子悬在 y 200 的空中）。
// 切口不能穿过地毯（地毯 y −15～−9）：补面把切开的地毯当整格补，立起一整格高的地毯面
const cutBoxes = [[-2, -27, -3, 23, -16, 12]];
// 发光区收紧到灯笼、蜡烛的模型（灯笼 6 像素宽、挂着的高 9 像素）：盒子要是整格，贴着的墙面也在盒子边上，会跟着亮成一块
const lampBox = hallLamps.filter((l) => l.lit).map((l) => [l.位[0] - 0.25, l.位[1] - 0.25, l.位[2], l.位[0] + 0.25, l.位[1] + 0.25, l.位[2] + 0.8]);

const liYing = { ...standPose(firstFloor.maid), yaw: 180 };
// 九胡：侧面（正交）里正对镜头，朝向是 90° 的整数倍、方块面不斜；透视里侧过来看她
const jiuHu = (v: View) => ({ ...standPose([13.4, -10.8, firstFloor.carpetTop]), yaw: v.cameraRig === '侧面' ? 180 : 200 });
const chestPos: V3 = [9.5, -10.5, firstFloor.carpetTop];
const cakePos: V3 = [10.4, -11.4, firstFloor.carpetTop + 0.25];

const rigParams = (v: View): CameraRigParams =>
  v.cameraRig === '侧面'
    ? { ...orthoRig({ 看: sideLookAt, facing: '北' }), topDepth: v.topDepth ?? orthoTop }
    : { kind: '透视', ...(v.cameraRig === '透视' ? perspectiveRig : firstFloorRig) };

// 她模型（YSM）不在统一的贴图像素网格上：多数方块 0.9 个模型单位一个贴图像素（头 6.3 单位 7 个），也有 0.92、1.09、0.54 的，原点也不在网格上。
// 原大小一个贴图像素 0.9 × 0.65 / 16 格 = 3.5 成片像素。默认不缩放、只把脚底吸到像素网格；她贴图像素 的视图按 0.9 那种缩放，对比用
const herModelPixel = 0.9 * MAGICAL_WINE_FOX.scale;

const Scene: React.FC<{ v: View; 眼?: V3 }> = ({ v, 眼: eye }) => (
  <>
    {v.原样 && <FirstFloorLighting />}
    <BlockMesh info={houseInfo} bin={houseBin} atlas={houseAtlas} hideBlocks={v.cameraRig === '侧面' ? cutBoxes : undefined} patchEdges={v.cameraRig === '侧面' ? 1 : undefined} />
    <Outline>
      <TexturePixelAlign 锚={liYing.loc as V3} {...(v.herTexturePixel ? { modelPixel: herModelPixel, filmPixel: v.herTexturePixel, N: pixelCount } : {})}>
        <MagicalWineFox pose={liYing} 看={eye ? magicalWineFoxLookAt(liYing, eye) : undefined} />
      </TexturePixelAlign>
      <TexturePixelAlign 锚={jiuHu(v).loc as V3}>
        <Jiuhu pose={jiuHu(v)} tail={0} />
      </TexturePixelAlign>
      {/* 蛋糕 0.5 缩放，一个贴图像素正好 3 像素，只吸附 */}
      <TexturePixelAlign 锚={cakePos}>
        <group position={cakePos} rotation={[Math.PI / 2, 0, 0]} scale={0.5}>
          <ItemSprite layers={CAKE} />
        </group>
      </TexturePixelAlign>
    </Outline>
    {/* 箱子跟方块一样不描 */}
    <Chest 贴图={toVanillaCoords(VANILLA_CHEST_TEX, [64, 64])} p={chestPos} />
  </>
);

const rulerCells = 16;
const sampleText = '像素字：加入了游戏 0123456789';

/** 原版像素字一行（黄字带阴影，同聊天栏系统消息的「加入了游戏」）和一把贴图像素尺子（黑白相间 16 格 = 一格方块宽） */
const PixelTextLine: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = canvasDpr(1);
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, widthPx * dpr, height * dpr);
    const s = canvasPixel(pixelCount, dpr);
    for (let i = 0; i < rulerCells; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
      ctx.fillRect(Math.round((4 + i) * s), Math.round(4 * s), Math.round(s), Math.round(2 * s));
    }
    let x = 4;
    for (const ch of sampleText) {
      const o = shadowOffset(ch);
      drawText(ctx, ch, x + o, 8 + o, '#3f3f15', s);
      drawText(ctx, ch, x, 8, '#ffff55', s);
      x += textWidth(ch);
    }
  });
  return <canvas ref={ref} width={widthPx * dpr} height={height * dpr} style={{ position: 'absolute', left: 0, top: 0, width: widthPx, height: height }} />;
};

const picture: React.FC = () => {
  const v = useCheckView(views);
  const tone = palette[v.tone ?? '夏日白天'];
  const cameraRig = rigParams(v);
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <FilmPost grade={v.withPost ? tone.grade : null}>
        <ToonCanvas
          width={widthPx}
          height={height}
          cameraRig={cameraRig}
          天={tone.天}
          tint={tone.tint}
          glowRegions={v.lampGlow ? lampBox : undefined}
          AO={v.AO}
          outline={v.outlineWidth ? { width: v.outlineWidth, 色: tone.outlineColor } : false}
          flatShade={!v.原样}
        >
          <Scene v={v} 眼={cameraRig.kind === '透视' ? cameraRig.眼 : undefined} />
        </ToonCanvas>
        {v.cameraRig === '一楼机位' && (
          <>
            <Img src={shot} style={{ position: 'absolute', left: 0, top: 0, width: widthPx, height: height, clipPath: 'inset(0 0 0 50%)' }} />
            <div style={{ position: 'absolute', left: widthPx / 2 - 1, top: 0, width: 2, height: height, background: '#ffffff' }} />
          </>
        )}
        <PixelTextLine />
      </FilmPost>
      <div style={{ position: 'absolute', left: 12, bottom: 8, fontFamily: 'sans-serif', fontSize: 18, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        核对-三渲二 · {v.name}
        {v.withPost || v.tone ? ` · ${v.tone ?? '夏日白天'}` : ''}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
