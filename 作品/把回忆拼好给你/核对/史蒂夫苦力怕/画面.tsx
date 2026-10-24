// 史蒂夫苦力怕核对的画面：一帧一种姿势，并排三个正交机位（正面、右侧面、右前方四分之三俯 20°），左上角写视图名；第 15 帧是第一人称的空手。
// 模型默认照原版实体光照画（mcLight 1，白天满亮度），画布里没有灯，手里的蛋糕（ItemSprite 受场景光）靠 emissive 1 画出贴图原色；
// 默认材质的帧不传 mcLight，画布只放一盏强度 π 的环境光（漫反射 = 贴图原色）。地面是方块，顶面、南北面、东西面按 MC 的 1、0.8、0.6 平涂，看脚贴不贴地。
// 正交缩放：三视图页面上每格 128 像素（出片每格 256 像素），只为看清楚，史蒂夫一个贴图像素 15 像素、苦力怕 16 像素；成片的像素密度看「像素密度」那帧。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { FirstPersonCanvas, FirstPersonHand } from '@库/角色/第一人称.tsx';
import { STEVE, Steve, type StevePose, steveHeldItemPosition, steveLookAt, stevePose, steveSize, vanillaWalk } from '@库/角色/史蒂夫.tsx';
import { SteveFirstPersonArm } from '@库/角色/史蒂夫第一人称.tsx';
import { CREEPER, Creeper, type CreeperPose, creeperLookAt } from '@库/生物/苦力怕.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import { 视图们, type 史蒂夫姿势, type 苦力怕姿势 } from './视图.ts';

const 原点: V3 = [0, 0, 0];
const 迈开 = 0; // cos(limbSwing × 0.6662) = 1：腿迈到最开
const 半步 = Math.PI / 3 / 0.6662; // cos = 0.5
const 走 = vanillaWalk(STEVE.speed.walk, 1).stride;
const 潜行走 = vanillaWalk(STEVE.speed.sneak, 1).stride;
const 左上: V3 = [-3, 2, 3.2];

const 史蒂夫姿势表: Record<史蒂夫姿势, { pose: StevePose; 蛋糕?: boolean }> = {
  站: { pose: stevePose(原点, 0) },
  '走-迈开': { pose: stevePose(原点, 0, { limbSwing: 迈开, stride: 走 }) },
  '走-半步': { pose: stevePose(原点, 0, { limbSwing: 半步, stride: 走 }) },
  潜行: { pose: stevePose(原点, 0, { crouch: 1 }) },
  潜行走: { pose: stevePose(原点, 0, { crouch: 1, limbSwing: 迈开, stride: 潜行走 }) },
  看左上: { pose: steveLookAt(stevePose(原点, 0), 左上) },
  看脚前: { pose: steveLookAt(stevePose(原点, 0), [0, 1, 0]) },
  拿蛋糕: { pose: stevePose(原点, 0, { holdR: true }), 蛋糕: true },
  拿蛋糕走: { pose: stevePose(原点, 0, { holdR: true, limbSwing: 迈开, stride: 走 }), 蛋糕: true },
  潜行看左上拿蛋糕: { pose: steveLookAt(stevePose(原点, 0, { crouch: 1, holdR: true }), 左上), 蛋糕: true },
};

const 苦力怕站: CreeperPose = { loc: 原点, yaw: 0 };
const 苦力怕姿势表: Record<苦力怕姿势, CreeperPose> = {
  站: 苦力怕站,
  '走-追人': { ...苦力怕站, limbSwing: 迈开, stride: vanillaWalk(CREEPER.speed.chase, 1).stride },
  '走-逃跑': { ...苦力怕站, limbSwing: 半步, stride: vanillaWalk(CREEPER.speed.flee, 1).stride },
  转头左上: creeperLookAt(苦力怕站, [-3, 2, 3]),
  转头超限: creeperLookAt(苦力怕站, [-3, -2, 1.4]),
};

// 三个机位：从哪个方向看（场景坐标，Z 朝上），都对准脚底上方 1 格
const 机位们: { 名: string; 方向: V3 }[] = [
  { 名: '正面', 方向: [0, 1, 0] },
  { 名: '右侧面', 方向: [1, 0, 0] },
  { 名: '四分之三（右前上方）', 方向: [Math.SQRT1_2 * Math.cos(Math.PI / 9), Math.SQRT1_2 * Math.cos(Math.PI / 9), Math.sin(Math.PI / 9)] },
];
const 每格像素 = 128;
const 看: V3 = [0, 0, 1];
const 面板 = { 宽: 416, 高: 600, 顶: 80, 间: 8 };

const toThree = ([x, y, z]: V3) => new THREE.Vector3(x, z, -y);
const 正交机位: React.FC<{ 方向: V3; 每格?: number }> = ({ 方向, 每格 = 每格像素 }) => {
  const { camera } = useThree();
  const cam = camera as THREE.OrthographicCamera;
  const target = toThree(看);
  cam.position.copy(target.clone().add(toThree(方向).normalize().multiplyScalar(30)));
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  cam.zoom = 每格;
  cam.near = 0.1;
  cam.far = 100;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

// MC 方块的平涂明暗：three 的盒子六个面依次是 +x、−x、+y、−y、+z、−z（这里是东、西、北、南、顶、底）
const 明暗 = [0.6, 0.6, 0.8, 0.8, 1, 0.5];
// 明暗乘在 sRGB 数值上（游戏里顶点色就是这样乘的）
const 方块材质 = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 明暗.map((k) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r * k, g * k, b * k, THREE.SRGBColorSpace) }));
};
const 草 = [方块材质('#7fb238'), 方块材质('#6c9a2f')];
const 地面: React.FC = () => (
  <>
    {[-1, 0, 1].flatMap((x) =>
      [-1, 0, 1].map((y) => (
        <mesh key={`${x},${y}`} position={[x, y, -0.5]} material={草[(x + y + 2) % 2]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      )),
    )}
  </>
);

const 红点: React.FC<{ at: V3 }> = ({ at }) => (
  <mesh position={at} renderOrder={10}>
    <boxGeometry args={[0.04, 0.04, 0.04]} />
    <meshBasicMaterial color="#ff2020" depthTest={false} />
  </mesh>
);

const 三视图: React.FC<{ children: React.ReactNode; 灯?: boolean; 抗锯齿?: boolean }> = ({ children, 灯, 抗锯齿 }) => (
  <>
    {机位们.map((m, i) => (
      <div key={m.名} style={{ position: 'absolute', left: 面板.间 + i * (面板.宽 + 面板.间), top: 面板.顶, width: 面板.宽, height: 面板.高, background: '#8fa3b8' }}>
        <ThreeCanvas orthographic flat width={面板.宽} height={面板.高} gl={{ antialias: !!抗锯齿 }}>
          <正交机位 方向={m.方向} />
          {灯 && <ambientLight intensity={Math.PI} />}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <地面 />
            {children}
          </group>
        </ThreeCanvas>
        <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 18, color: '#ffffff', textShadow: '0 1px 3px #000' }}>{m.名}</div>
      </div>
    ))}
  </>
);

// 像素密度对比：三渲二定的 N=6（成片一个贴图像素 6 个输出像素，三渲二底座 分支 engine/三渲二/像素.ts），一格 16 × 6 ÷ 成片倍数 2 = 48 页面像素。
// 纯正面正交，看脚底 1 格高处，画面左边是场景 +X（正面看，人的右手在画面左边）；尺子柱是一格 16×16 的棋盘，一格棋盘一个贴图像素。
// 两臂摆正（不轻晃），只看像素格对不对得上。
const 密度 = { 每格: 48, 宽: 1264, 高: 600 };
const 尺子材质 = (() => {
  const d = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) d.fill(((i % 16) + Math.floor(i / 16)) % 2 ? 0xd8 : 0x9a, i * 4, i * 4 + 3).fill(255, i * 4 + 3, i * 4 + 4);
  const t = new THREE.DataTexture(d, 16, 16);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return new THREE.MeshBasicMaterial({ map: t });
})();
const 立正 = (loc: V3, scale?: number): StevePose => ({ ...stevePose(loc, 0, { scale }), armR: 0, armL: 0, armRRoll: 0, armLRoll: 0 });
const 密度站位: { 名: string; x: number }[] = [
  { 名: '史蒂夫 0.9375 倍（原版）', x: 5 },
  { 名: '史蒂夫 1 倍', x: 0 },
  { 名: '苦力怕（原版 1 倍）', x: -5 },
];
const 像素密度: React.FC = () => (
  <div style={{ position: 'absolute', left: 面板.间, top: 面板.顶, width: 密度.宽, height: 密度.高, background: '#8fa3b8' }}>
    <ThreeCanvas orthographic flat width={密度.宽} height={密度.高} gl={{ antialias: false }}>
      <正交机位 方向={[0, 1, 0]} 每格={密度.每格} />
      <ambientLight intensity={Math.PI} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {Array.from({ length: 15 }, (_, i) => (
          <mesh key={i} position={[i - 7, 0, -0.5]} material={草[i % 2]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        ))}
        {[6, 1].flatMap((x) =>
          [0.5, 1.5].map((z) => (
            <mesh key={`${x},${z}`} position={[x, 0, z]} material={尺子材质}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          )),
        )}
        {密度站位.map((p, i) => (i === 2 ? <Creeper key={p.名} pose={{ loc: [p.x, 0, 0] }} /> : <Steve key={p.名} pose={立正([p.x, 0, 0], i === 1 ? 1 : undefined)} />))}
      </group>
    </ThreeCanvas>
    {密度站位.map((p) => (
      <div key={p.名} style={{ position: 'absolute', left: 密度.宽 / 2 - p.x * 密度.每格 - 110, width: 220, top: 密度.高 / 2 + 1.5 * 密度.每格, textAlign: 'center', fontSize: 16, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        {p.名}
      </div>
    ))}
    <div style={{ position: 'absolute', left: 16, top: 16, fontSize: 16, lineHeight: 1.6, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
      页面每格 {密度.每格} 像素，出片每格 96 像素：方块、苦力怕、1 倍史蒂夫的一个贴图像素 6 像素；0.9375 倍史蒂夫 5.625 像素，最近邻下一格宽一格窄。
      <br />
      两根尺子柱各 2 格高：1 倍史蒂夫头顶 {steveSize(1).height} 格、齐柱顶；0.9375 倍 {STEVE.height} 格。
    </div>
  </div>
);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const { width, height } = useVideoConfig();
  let 内容: React.ReactNode = null;
  if (v.主体 === '史蒂夫') {
    const { pose, 蛋糕 } = 史蒂夫姿势表[v.姿势];
    const mc = v.默认材质 ? undefined : 1;
    内容 = (
      <三视图 灯={v.默认材质} 抗锯齿={v.抗锯齿}>
        <Steve pose={pose} mcLight={mc} handR={蛋糕 ? <ItemSprite layers={CAKE} emissive={mc ? 1 : 0} shadow={false} /> : undefined} />
        {蛋糕 && <红点 at={steveHeldItemPosition(pose)} />}
      </三视图>
    );
  } else if (v.主体 === '苦力怕') {
    内容 = (
      <三视图 灯={v.默认材质} 抗锯齿={v.抗锯齿}>
        <Creeper pose={苦力怕姿势表[v.姿势]} mcLight={v.默认材质 ? undefined : 1} />
      </三视图>
    );
  } else if (v.主体 === '像素密度') {
    内容 = <像素密度 />;
  } else {
    内容 = (
      <FirstPersonCanvas width={width} height={height}>
        <FirstPersonHand held={null} arm={<SteveFirstPersonArm />} swing={0} equip={0} />
      </FirstPersonCanvas>
    );
  }
  return (
    <AbsoluteFill style={{ background: v.主体 === '第一人称' ? 'linear-gradient(#a7aeb5, #6c737a)' : '#5a5e66', fontFamily: uiFontFamily }}>
      {内容}
      <div style={{ position: 'absolute', left: 16, top: 14, fontSize: 24, color: '#ffffff', textShadow: '0 1px 3px #000' }}>核对-史蒂夫苦力怕 · {v.名}</div>
    </AbsoluteFill>
  );
};

export default 画面;
