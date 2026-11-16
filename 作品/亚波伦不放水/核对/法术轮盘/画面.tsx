// 核对-法术轮盘的画面：灰蓝底（带子是 25% 的黑，纯黑底上看不见），轮盘居中，左上角写视图名和每圈格数；图标对照表里缺的聚晶用红字列在左下。
// GUI 缩放按最外圈放得下取（上下各留 24 像素），并让 4K 出片时一个 GUI 像素是整数个输出像素（缩放取 1/3 的整数倍，上限 8/3 = 4K 下 8 倍）：
// 三圈以内 8/3，四圈 2。8/3 是这里取的值，游戏里 4K 屏的自动界面尺寸会更大，成片用几倍没定。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { sceneToThree, placeCamera } from '@engine/core/three换算.ts';
import { png } from '@engine/model/贴图.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import { useViewIndex } from '@engine/段/时间.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { RadialWheel } from '@库/界面/径向轮盘.tsx';
import { WheelWorldPlane } from '@库/界面/径向轮盘世界.tsx';
import type { WheelCell } from '@库/界面/径向轮盘画.ts';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import focusWheelPng from 'asset:贴图/界面/聚晶轮盘';
import { fitScale } from '../../界面/分圈.ts';
import { MultiRingWheel, drawMultiRingWheel, missingIcons, wheelOuterRadius, type MultiRingParams } from '../../界面/多圈轮盘.tsx';
import { arrangeWheel, sortSpells, focusKey, pickSpells } from '../../界面/轮盘法术.ts';
import { focusIcons } from '../../物品/聚晶图标.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { openTicks, views, type View } from './视图.ts';

const baseColor = '#46505e';
const vanillaOuterRadiusPx = 60;
const getIcon = (focusKey: string) => png((focusIcons as Record<string, string>)[focusKey]!);
// 原版对照里放的聚晶：有画面的那些照注册顺序取前几个，圆心画第一个
const vanillaFocusKeys = sortSpells(pickSpells('有画面'), '注册').map(focusKey);

const multiRingParams = (view: Extract<View, { pictureMode: '多圈' | '世界' }>): MultiRingParams => {
  const { name: unusedName, pictureMode: drawKind, 刻: tick, ...rest } = view;
  return { ...rest, 刻: tick ?? openTicks };
};

// 示意用的机位：从右前上方看，轮盘带透视
const cameraRig: Cam = { pos: [5.6, 5.4, 1.5], tgt: [0, -0.9, 2.3], lens: 24 };
const PlaceRig: React.FC = () => {
  const { camera, size } = useThree();
  placeCamera(camera as THREE.PerspectiveCamera, cameraRig, size.width / size.height);
  return null;
};

const WorldDiagram: React.FC<{ params: MultiRingParams }> = ({ params }) => {
  const { width, height } = useVideoConfig();
  // 轮盘圆心在史蒂夫身后 0.9 格、头顶高度附近；一个 GUI 像素 0.02 格，三圈（外半径 120）在世界里半径 2.4 格
  const cellsPerPixel = 0.02;
  const radius = Math.max(128, wheelOuterRadius(params) + 4);
  return (
    <ThreeCanvas flat width={width} height={height} gl={{ antialias: false }}>
      <PlaceRig />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Steve pose={stevePose([0, 0, 1], 0)} mcLight={1} />
      </group>
      <group position={sceneToThree([0, -0.9, 2.3])} rotation={[0, Math.PI, 0]}>
        <WheelWorldPlane draw={(canvasPos) => drawMultiRingWheel(canvasPos, params)} radius={radius} cellsPerPixel={cellsPerPixel} deps={[JSON.stringify(params)]} />
      </group>
    </ThreeCanvas>
  );
};

export default definePicture(seg, soundUrl, () => {
  const { width, height } = useVideoConfig();
  const view = views[Math.min(views.length - 1, useViewIndex())]!;
  let note = '';
  let missing: string[] = [];
  let content: React.ReactNode;
  if (view.pictureMode === '原版') {
    const wheelCells: WheelCell[] = vanillaFocusKeys.slice(0, view.cellCount).map((focusKey) => ({ icon: getIcon(focusKey) }));
    if (view.textCell) wheelCells.push({ 文字: view.textCell });
    const s = fitScale(vanillaOuterRadiusPx, height, 24, 1 / 3, 8 / 3);
    note = `一圈 ${wheelCells.length} 格，内半径 30、外半径 60 GUI 像素，GUI 缩放 ${(s * 3).toFixed(0)}/3`;
    content = <RadialWheel width={width} height={height} s={s} cell={wheelCells} 刻={view.刻 ?? openTicks} selectedIdx={view.selectedId} centerIcon={getIcon(vanillaFocusKeys[0]!)} backdrop={png(focusWheelPng)} />;
  } else {
    const params = multiRingParams(view);
    const { cellsPerRing, items: items } = arrangeWheel(params);
    missing = missingIcons(params);
    const outerRadius = wheelOuterRadius(params);
    const s = fitScale(outerRadius, height, 24, 1 / 3, 8 / 3);
    note = `${items.length} 个法术，${cellsPerRing.length} 圈，每圈格数（由里向外）${cellsPerRing.join('、')}，外半径 ${outerRadius} GUI 像素，第 ${params.刻} 刻` + (view.pictureMode === '多圈' ? `，GUI 缩放 ${(s * 3).toFixed(0)}/3` : '');
    content = view.pictureMode === '世界' ? <WorldDiagram params={params} /> : <MultiRingWheel width={width} height={height} s={s} {...params} />;
  }
  return (
    <AbsoluteFill style={{ background: baseColor }}>
      {content}
      <div style={{ position: 'absolute', left: 16, top: 12, fontFamily: uiFontFamily, fontSize: 15, lineHeight: 1.4, color: '#ffffff', textShadow: '0 1px 2px #000' }}>
        <div>{view.name}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{note}</div>
      </div>
      {missing.length > 0 && (
        <div style={{ position: 'absolute', left: 16, bottom: 12, fontFamily: uiFontFamily, fontSize: 12, color: '#ff6060', maxWidth: 400 }}>{`缺图标 ${missing.length} 个：${missing.join('、')}`}</div>
      )}
    </AbsoluteFill>
  );
});
