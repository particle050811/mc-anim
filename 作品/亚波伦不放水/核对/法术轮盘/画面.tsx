// 核对-法术轮盘的画面：灰蓝底（带子是 25% 的黑，纯黑底上看不见），轮盘居中，左上角写视图名和每圈格数；图标对照表里缺的聚晶用红字列在左下。
// GUI 缩放按最外圈放得下取（上下各留 24 像素），并让 4K 出片时一个 GUI 像素是整数个输出像素（缩放取 1/3 的整数倍，上限 8/3 = 4K 下 8 倍）：
// 三圈以内 8/3，四圈 2。8/3 是这里取的值，游戏里 4K 屏的自动界面尺寸会更大，成片用几倍没定。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { 场景到three, 摆相机 } from '@engine/core/three换算.ts';
import { png } from '@engine/model/贴图.ts';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { use视图下标 } from '@engine/段/时间.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 径向轮盘 } from '@库/界面/径向轮盘.tsx';
import { 轮盘世界面 } from '@库/界面/径向轮盘世界.tsx';
import type { 轮盘格 } from '@库/界面/径向轮盘画.ts';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import 底纹地址 from 'asset:贴图/界面/聚晶轮盘';
import { 适配缩放 } from '../../界面/分圈.ts';
import { 多圈轮盘, 画多圈轮盘, 缺图标, 轮盘外半径, type 多圈轮盘参数 } from '../../界面/多圈轮盘.tsx';
import { 排盘, 排法术, 聚晶键, 选法术 } from '../../界面/轮盘法术.ts';
import { 聚晶图标 } from '../../物品/聚晶图标.ts';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';
import { 张开刻, 视图们, type 视图 } from './视图.ts';

const 底色 = '#46505e';
const 原版外半径 = 60;
const 取图 = (键: string) => png((聚晶图标 as Record<string, string>)[键]!);
// 原版对照里放的聚晶：有画面的那些照注册顺序取前几个，圆心画第一个
const 原版聚晶 = 排法术(选法术('有画面'), '注册').map(聚晶键);

const 多圈参数 = (视: Extract<视图, { 画: '多圈' | '世界' }>): 多圈轮盘参数 => {
  const { 名: _名, 画: _画, 刻, ...其余 } = 视;
  return { ...其余, 刻: 刻 ?? 张开刻 };
};

// 示意用的机位：从右前上方看，轮盘带透视
const 机位: Cam = { pos: [5.6, 5.4, 1.5], tgt: [0, -0.9, 2.3], lens: 24 };
const 摆机位: React.FC = () => {
  const { camera, size } = useThree();
  摆相机(camera as THREE.PerspectiveCamera, 机位, size.width / size.height);
  return null;
};

const 世界示意: React.FC<{ 参: 多圈轮盘参数 }> = ({ 参 }) => {
  const { width, height } = useVideoConfig();
  // 轮盘圆心在史蒂夫身后 0.9 格、头顶高度附近；一个 GUI 像素 0.02 格，三圈（外半径 120）在世界里半径 2.4 格
  const 每像素格 = 0.02;
  const 半径 = Math.max(128, 轮盘外半径(参) + 4);
  return (
    <ThreeCanvas flat width={width} height={height} gl={{ antialias: false }}>
      <摆机位 />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Steve pose={stevePose([0, 0, 1], 0)} mcLight={1} />
      </group>
      <group position={场景到three([0, -0.9, 2.3])} rotation={[0, Math.PI, 0]}>
        <轮盘世界面 画={(位) => 画多圈轮盘(位, 参)} 半径={半径} 每像素格={每像素格} 依赖={[JSON.stringify(参)]} />
      </group>
    </ThreeCanvas>
  );
};

export default 定义画面(段, 声音, () => {
  const { width, height } = useVideoConfig();
  const 视 = 视图们[Math.min(视图们.length - 1, use视图下标())]!;
  let 说明 = '';
  let 缺: string[] = [];
  let 内容: React.ReactNode;
  if (视.画 === '原版') {
    const 格: 轮盘格[] = 原版聚晶.slice(0, 视.格数).map((键) => ({ 图标: 取图(键) }));
    if (视.文字格) 格.push({ 文字: 视.文字格 });
    const s = 适配缩放(原版外半径, height, 24, 1 / 3, 8 / 3);
    说明 = `一圈 ${格.length} 格，内半径 30、外半径 60 GUI 像素，GUI 缩放 ${(s * 3).toFixed(0)}/3`;
    内容 = <径向轮盘 宽={width} 高={height} s={s} 格={格} 刻={视.刻 ?? 张开刻} 选中={视.选中} 圆心={取图(原版聚晶[0]!)} 底纹={png(底纹地址)} />;
  } else {
    const 参 = 多圈参数(视);
    const { 每圈格数, 项 } = 排盘(参);
    缺 = 缺图标(参);
    const 外 = 轮盘外半径(参);
    const s = 适配缩放(外, height, 24, 1 / 3, 8 / 3);
    说明 = `${项.length} 个法术，${每圈格数.length} 圈，每圈格数（由里向外）${每圈格数.join('、')}，外半径 ${外} GUI 像素，第 ${参.刻} 刻` + (视.画 === '多圈' ? `，GUI 缩放 ${(s * 3).toFixed(0)}/3` : '');
    内容 = 视.画 === '世界' ? <世界示意 参={参} /> : <多圈轮盘 宽={width} 高={height} s={s} {...参} />;
  }
  return (
    <AbsoluteFill style={{ background: 底色 }}>
      {内容}
      <div style={{ position: 'absolute', left: 16, top: 12, fontFamily: uiFontFamily, fontSize: 15, lineHeight: 1.4, color: '#ffffff', textShadow: '0 1px 2px #000' }}>
        <div>{视.名}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{说明}</div>
      </div>
      {缺.length > 0 && (
        <div style={{ position: 'absolute', left: 16, bottom: 12, fontFamily: uiFontFamily, fontSize: 12, color: '#ff6060', maxWidth: 400 }}>{`缺图标 ${缺.length} 个：${缺.join('、')}`}</div>
      )}
    </AbsoluteFill>
  );
});
