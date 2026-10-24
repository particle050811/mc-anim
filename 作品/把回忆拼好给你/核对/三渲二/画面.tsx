// 三渲二核对的画面：按视图表一帧画一个视图。左上角一行原版像素字和一把 16 格的贴图像素尺子，都按 像素N 画，和 3D 的贴图像素比大小；左下角写视图名（不过后期）。
// 待迁移（私有资产）：对照用的游戏截图私有（核对段，不进成片），公开构建缺了怎么降级还没定
import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { 画布像素 } from '@engine/三渲二/像素.ts';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import type { 机位参数 } from '@engine/三渲二/机位.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { BlockMesh, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import { drawText, shadowOffset, textWidth } from '@库/界面/像素字.ts';
import { Jiuhu } from '@库/角色/九胡.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { Chest, VANILLA_CHEST_TEX } from '@库/物品/箱子.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import houseRaw from 'asset:网格/隐世之境一楼/头';
import houseBin from 'asset:网格/隐世之境一楼/顶点';
import houseAtlas from 'asset:网格/隐世之境一楼/图集';
import shot from 'asset:截图/隐世之境/一楼机位';
import { 一楼, 一楼灯光, 主厅灯 } from '../../地点/隐世之境一楼.tsx';
import { 像素N, 正交机位, 正交顶面 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 一楼机, 侧面看, 视图们, 透视机, type 视图 } from './视图.ts';

const houseInfo = houseRaw as unknown as BlockMeshInfo;
const 宽 = 1280;
const 高 = 720;

// 侧剖面：主厅南头（y < −16）的方块藏掉，切口和导出边补面，裙边只往下补 1 格（屋子悬在 y 200 的空中）。
// 切口不能穿过地毯（地毯 y −15～−9）：补面把切开的地毯当整格补，立起一整格高的地毯面
const 剖盒 = [[-2, -27, -3, 23, -16, 12]];
// 发光区收紧到灯笼、蜡烛的模型（灯笼 6 像素宽、挂着的高 9 像素）：盒子要是整格，贴着的墙面也在盒子边上，会跟着亮成一块
const 灯盒 = 主厅灯.filter((l) => l.点着).map((l) => [l.位[0] - 0.25, l.位[1] - 0.25, l.位[2], l.位[0] + 0.25, l.位[1] + 0.25, l.位[2] + 0.8]);

const 她 = { ...standPose(一楼.女仆), yaw: 180 };
const 九胡 = { ...standPose([13.4, -10.8, 一楼.地毯顶面]), yaw: 200 };
const 箱子位: V3 = [9.5, -10.5, 一楼.地毯顶面];
const 蛋糕位: V3 = [10.4, -11.4, 一楼.地毯顶面 + 0.25];

const 机位参 = (v: 视图): 机位参数 =>
  v.机位 === '侧面'
    ? { ...正交机位({ 看: 侧面看, 朝: '北' }), 顶面: v.顶面 ?? 正交顶面 }
    : { 种: '透视', ...(v.机位 === '透视' ? 透视机 : 一楼机) };

const 场景: React.FC<{ v: 视图; 眼?: V3 }> = ({ v, 眼 }) => (
  <>
    {v.原样 && <一楼灯光 />}
    <BlockMesh info={houseInfo} bin={houseBin} atlas={houseAtlas} hideBlocks={v.机位 === '侧面' ? 剖盒 : undefined} patchEdges={v.机位 === '侧面' ? 1 : undefined} />
    <描边>
      <MagicalWineFox pose={她} 看={眼 ? magicalWineFoxLookAt(她, 眼) : undefined} />
      <Jiuhu pose={九胡} tail={0} />
      <group position={蛋糕位} rotation={[Math.PI / 2, 0, 0]} scale={0.5}>
        <ItemSprite layers={CAKE} />
      </group>
    </描边>
    {/* 箱子跟方块一样不描 */}
    <Chest 贴图={VANILLA_CHEST_TEX} p={箱子位} />
  </>
);

const 尺子格 = 16;
const 字 = '像素字：加入了游戏 0123456789';

/** 原版像素字一行（黄字带阴影，同聊天栏系统消息的「加入了游戏」）和一把贴图像素尺子（黑白相间 16 格 = 一格方块宽） */
const 像素字行: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = canvasDpr(1);
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, 宽 * dpr, 高 * dpr);
    const s = 画布像素(像素N, dpr);
    for (let i = 0; i < 尺子格; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
      ctx.fillRect(Math.round((4 + i) * s), Math.round(4 * s), Math.round(s), Math.round(2 * s));
    }
    let x = 4;
    for (const ch of 字) {
      const o = shadowOffset(ch);
      drawText(ctx, ch, x + o, 8 + o, '#3f3f15', s);
      drawText(ctx, ch, x, 8, '#ffff55', s);
      x += textWidth(ch);
    }
  });
  return <canvas ref={ref} width={宽 * dpr} height={高 * dpr} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 调子 = 色板[v.调子 ?? '夏日白天'];
  const 机位 = 机位参(v);
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <整片后期 调色={v.后期 ? 调子.调色 : null}>
        <三渲二画布
          宽={宽}
          高={高}
          机位={机位}
          天={调子.天}
          色调={调子.色调}
          发光区={v.灯发光 ? 灯盒 : undefined}
          描边={v.描边 ? { 宽: v.描边, 色: 调子.描边 } : false}
          平涂={!v.原样}
        >
          <场景 v={v} 眼={机位.种 === '透视' ? 机位.眼 : undefined} />
        </三渲二画布>
        {v.机位 === '一楼机位' && (
          <>
            <Img src={shot} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, clipPath: 'inset(0 0 0 50%)' }} />
            <div style={{ position: 'absolute', left: 宽 / 2 - 1, top: 0, width: 2, height: 高, background: '#ffffff' }} />
          </>
        )}
        <像素字行 />
      </整片后期>
      <div style={{ position: 'absolute', left: 12, bottom: 8, fontFamily: 'sans-serif', fontSize: 18, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        核对-三渲二 · {v.名}
        {v.后期 || v.调子 ? ` · ${v.调子 ?? '夏日白天'}` : ''}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
