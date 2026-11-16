// 史蒂夫苦力怕核对的画面：一帧一种姿势，并排三个正交机位（正面、右侧面、右前方四分之三俯 20°），左上角写视图名；第 15 帧是第一人称的空手。
// 模型默认照原版实体光照画（mcLight 1，白天满亮度），画布里没有灯，手里的蛋糕（ItemSprite 受场景光）靠 emissive 1 画出贴图原色；
// 默认材质的帧不传 mcLight，画布只放一盏强度 π 的环境光（漫反射 = 贴图原色）。地面是方块，顶面、南北面、东西面按 MC 的 1、0.8、0.6 平涂，看脚贴不贴地。
// 正交缩放：三视图页面上每格 128 像素（出片每格 256 像素），只为看清楚，史蒂夫一个贴图像素 15 像素、苦力怕 16 像素；成片的像素密度看「像素密度」那帧。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { FirstPersonCanvas, FirstPersonHand } from '@库/角色/第一人称.tsx';
import { STEVE, Steve, type StevePose, steveHeldItemPosition, steveLookAt, stevePose, steveSize, vanillaWalk } from '@库/角色/史蒂夫.tsx';
import { SteveFirstPersonArm } from '@库/角色/史蒂夫第一人称.tsx';
import { CREEPER, Creeper, type CreeperPose, creeperLookAt } from '@库/生物/苦力怕.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import { views, type StevePosePreset, type CreeperPosePreset } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { sceneToThree } from '@engine/core/three换算.ts';

const originPos: V3 = [0, 0, 0];
const stepWide = 0; // cos(limbSwing × 0.6662) = 1：腿迈到最开
const halfStep = Math.PI / 3 / 0.6662; // cos = 0.5
const stride = vanillaWalk(STEVE.speed.walk, 1).stride;
const sneakWalk = vanillaWalk(STEVE.speed.sneak, 1).stride;
const upperLeft: V3 = [-3, 2, 3.2];

const stevePoseTable: Record<StevePosePreset, { pose: StevePose; 蛋糕?: boolean }> = {
  站: { pose: stevePose(originPos, 0) },
  '走-迈开': { pose: stevePose(originPos, 0, { limbSwing: stepWide, stride: stride }) },
  '走-半步': { pose: stevePose(originPos, 0, { limbSwing: halfStep, stride: stride }) },
  潜行: { pose: stevePose(originPos, 0, { crouch: 1 }) },
  潜行走: { pose: stevePose(originPos, 0, { crouch: 1, limbSwing: stepWide, stride: sneakWalk }) },
  看左上: { pose: steveLookAt(stevePose(originPos, 0), upperLeft) },
  看脚前: { pose: steveLookAt(stevePose(originPos, 0), [0, 1, 0]) },
  拿蛋糕: { pose: stevePose(originPos, 0, { holdR: true }), 蛋糕: true },
  拿蛋糕走: { pose: stevePose(originPos, 0, { holdR: true, limbSwing: stepWide, stride: stride }), 蛋糕: true },
  潜行看左上拿蛋糕: { pose: steveLookAt(stevePose(originPos, 0, { crouch: 1, holdR: true }), upperLeft), 蛋糕: true },
};

const creeperStand: CreeperPose = { loc: originPos, yaw: 0 };
const creeperPoseTable: Record<CreeperPosePreset, CreeperPose> = {
  站: creeperStand,
  '走-追人': { ...creeperStand, limbSwing: stepWide, stride: vanillaWalk(CREEPER.speed.chase, 1).stride },
  '走-逃跑': { ...creeperStand, limbSwing: halfStep, stride: vanillaWalk(CREEPER.speed.flee, 1).stride },
  转头左上: creeperLookAt(creeperStand, [-3, 2, 3]),
  转头超限: creeperLookAt(creeperStand, [-3, -2, 1.4]),
};

// 三个机位：从哪个方向看（场景坐标，Z 朝上），都对准脚底上方 1 格
const cameraRigs: { name: string; viewDir: V3 }[] = [
  { name: '正面', viewDir: [0, 1, 0] },
  { name: '右侧面', viewDir: [1, 0, 0] },
  { name: '四分之三（右前上方）', viewDir: [Math.SQRT1_2 * Math.cos(Math.PI / 9), Math.SQRT1_2 * Math.cos(Math.PI / 9), Math.sin(Math.PI / 9)] },
];
const pixelsPerCell = 128;
const lookAt: V3 = [0, 0, 1];
const panel = { width: 416, height: 600, top: 80, 间: 8 };
const OrthoRig: React.FC<{ viewDir: V3; pxPerCell?: number }> = ({ viewDir, pxPerCell = pixelsPerCell }) => {
  const { camera } = useThree();
  const cam = camera as THREE.OrthographicCamera;
  const target = sceneToThree(lookAt);
  cam.position.copy(target.clone().add(sceneToThree(viewDir).normalize().multiplyScalar(30)));
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  cam.zoom = pxPerCell;
  cam.near = 0.1;
  cam.far = 100;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

// MC 方块的平涂明暗：three 的盒子六个面依次是 +x、−x、+y、−y、+z、−z（这里是东、西、北、南、顶、底）
const faceShades = [0.6, 0.6, 0.8, 0.8, 1, 0.5];
// 明暗乘在 sRGB 数值上（游戏里顶点色就是这样乘的）
const blockMaterial = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return faceShades.map((k) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r * k, g * k, b * k, THREE.SRGBColorSpace) }));
};
const grassMaterials = [blockMaterial('#7fb238'), blockMaterial('#6c9a2f')];
const Ground: React.FC = () => (
  <>
    {[-1, 0, 1].flatMap((x) =>
      [-1, 0, 1].map((y) => (
        <mesh key={`${x},${y}`} position={[x, y, -0.5]} material={grassMaterials[(x + y + 2) % 2]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      )),
    )}
  </>
);

const RedDot: React.FC<{ at: V3 }> = ({ at }) => (
  <mesh position={at} renderOrder={10}>
    <boxGeometry args={[0.04, 0.04, 0.04]} />
    <meshBasicMaterial color="#ff2020" depthTest={false} />
  </mesh>
);

const TriView: React.FC<{ children: React.ReactNode; lit?: boolean; antialias?: boolean }> = ({ children, lit, antialias }) => (
  <>
    {cameraRigs.map((m, i) => (
      <div key={m.name} style={{ position: 'absolute', left: panel.间 + i * (panel.width + panel.间), top: panel.top, width: panel.width, height: panel.height, background: '#8fa3b8' }}>
        <ThreeCanvas orthographic flat width={panel.width} height={panel.height} gl={{ antialias: !!antialias }}>
          <OrthoRig viewDir={m.viewDir} />
          {lit && <ambientLight intensity={Math.PI} />}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Ground />
            {children}
          </group>
        </ThreeCanvas>
        <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 18, color: '#ffffff', textShadow: '0 1px 3px #000' }}>{m.name}</div>
      </div>
    ))}
  </>
);

// 像素密度对比：三渲二定的 N=6（成片一个贴图像素 6 个输出像素，三渲二底座 分支 engine/三渲二/像素.ts），一格 16 × 6 ÷ 成片倍数 2 = 48 页面像素。
// 纯正面正交，看脚底 1 格高处，画面左边是场景 +X（正面看，人的右手在画面左边）；尺子柱是一格 16×16 的棋盘，一格棋盘一个贴图像素。
// 两臂摆正（不轻晃），只看像素格对不对得上。
const grid = { pxPerCell: 48, width: 1264, height: 600 };
const rulerMaterial = (() => {
  const d = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) d.fill(((i % 16) + Math.floor(i / 16)) % 2 ? 0xd8 : 0x9a, i * 4, i * 4 + 3).fill(255, i * 4 + 3, i * 4 + 4);
  const t = new THREE.DataTexture(d, 16, 16);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return new THREE.MeshBasicMaterial({ map: t });
})();
const attention = (loc: V3, scale?: number): StevePose => ({ ...stevePose(loc, 0, { scale }), armR: 0, armL: 0, armRRoll: 0, armLRoll: 0 });
const densityStands: { name: string; x: number }[] = [
  { name: '史蒂夫 0.9375 倍（原版）', x: 5 },
  { name: '史蒂夫 1 倍', x: 0 },
  { name: '苦力怕（原版 1 倍）', x: -5 },
];
const PixelDensity: React.FC = () => (
  <div style={{ position: 'absolute', left: panel.间, top: panel.top, width: grid.width, height: grid.height, background: '#8fa3b8' }}>
    <ThreeCanvas orthographic flat width={grid.width} height={grid.height} gl={{ antialias: false }}>
      <OrthoRig viewDir={[0, 1, 0]} pxPerCell={grid.pxPerCell} />
      <ambientLight intensity={Math.PI} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {Array.from({ length: 15 }, (_, i) => (
          <mesh key={i} position={[i - 7, 0, -0.5]} material={grassMaterials[i % 2]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        ))}
        {[6, 1].flatMap((x) =>
          [0.5, 1.5].map((z) => (
            <mesh key={`${x},${z}`} position={[x, 0, z]} material={rulerMaterial}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          )),
        )}
        {densityStands.map((p, i) => (i === 2 ? <Creeper key={p.name} pose={{ loc: [p.x, 0, 0] }} /> : <Steve key={p.name} pose={attention([p.x, 0, 0], i === 1 ? 1 : undefined)} />))}
      </group>
    </ThreeCanvas>
    {densityStands.map((p) => (
      <div key={p.name} style={{ position: 'absolute', left: grid.width / 2 - p.x * grid.pxPerCell - 110, width: 220, top: grid.height / 2 + 1.5 * grid.pxPerCell, textAlign: 'center', fontSize: 16, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        {p.name}
      </div>
    ))}
    <div style={{ position: 'absolute', left: 16, top: 16, fontSize: 16, lineHeight: 1.6, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
      页面每格 {grid.pxPerCell} 像素，出片每格 96 像素：方块、苦力怕、1 倍史蒂夫的一个贴图像素 6 像素；0.9375 倍史蒂夫 5.625 像素，最近邻下一格宽一格窄。
      <br />
      两根尺子柱各 2 格高：1 倍史蒂夫头顶 {steveSize(1).height} 格、齐柱顶；0.9375 倍 {STEVE.height} 格。
    </div>
  </div>
);

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const { width, height } = useVideoConfig();
  let content: React.ReactNode = null;
  if (v.subject === '史蒂夫') {
    const { pose, 蛋糕: hasCake } = stevePoseTable[v.poseKey];
    const mc = v.defaultMaterial ? undefined : 1;
    content = (
      <TriView lit={v.defaultMaterial} antialias={v.antialias}>
        <Steve pose={pose} mcLight={mc} handR={hasCake ? <ItemSprite layers={CAKE} emissive={mc ? 1 : 0} shadow={false} /> : undefined} />
        {hasCake && <RedDot at={steveHeldItemPosition(pose)} />}
      </TriView>
    );
  } else if (v.subject === '苦力怕') {
    content = (
      <TriView lit={v.defaultMaterial} antialias={v.antialias}>
        <Creeper pose={creeperPoseTable[v.poseKey]} mcLight={v.defaultMaterial ? undefined : 1} />
      </TriView>
    );
  } else if (v.subject === '像素密度') {
    content = <PixelDensity />;
  } else {
    content = (
      <FirstPersonCanvas width={width} height={height}>
        <FirstPersonHand held={null} arm={<SteveFirstPersonArm />} swing={0} equip={0} />
      </FirstPersonCanvas>
    );
  }
  return (
    <AbsoluteFill style={{ background: v.subject === '第一人称' ? 'linear-gradient(#a7aeb5, #6c737a)' : '#5a5e66', fontFamily: uiFontFamily }}>
      {content}
      <div style={{ position: 'absolute', left: 16, top: 14, fontSize: 24, color: '#ffffff', textShadow: '0 1px 3px #000' }}>核对-史蒂夫苦力怕 · {v.name}</div>
    </AbsoluteFill>
  );
};

export default picture;
