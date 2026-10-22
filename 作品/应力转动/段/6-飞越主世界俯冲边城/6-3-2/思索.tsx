// 6-3-2 思索：两人骑在悬停的扫帚上、李樱介绍动力压路机时盖上来的机械动力思索界面（戏和时间在 编排.ts、台词.ts，
// 扫帚上的戏和镜头在 扫帚上.ts，界面外框在 模型/界面/思索界面.tsx，三维场景板和界面层的共用画法在 模型/界面/思索场景.tsx，转场在 转场.ts）。
// 画面从下往上：世界画面（6-3-下坠/画面.tsx 按全局帧画；界面淡入以后被不透明的底色盖住，不画）→ 思索的底色 → 场景板、李樱、锤上的压路机虚影、金光、方块碎屑
// （三维，互相遮挡）→ 标题、按钮、进度条、说明框（2D）→ 标题框里的物品（动力压路机，三维）。
// 思索里的李樱和下坠里是同一个模型、同一套姿势和灯（灯的方向跟着他转 ψ，见 编排.ts 的 `figureRef`），转场时和底下真的俯冲叠得上。
// 两版：
// - `RollerPonder`：世界 + 界面 + 李樱的配音 + 关界面的按钮声 + 推近时起的风声（6-3-下坠/声音.tsx），完整的一段（拼在 6-2-5至6-3-3 里，见 6-2至6-3段界/段表.ts）；
// - 6-3-2-思索界面层：只有界面 + 按钮声，比本段多 `淡出帧数` − 1 帧（接着画到 6-3-3 里淡完），剪辑时要单独叠界面用。
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { pngDir, type Png } from '@engine/model/贴图.ts';
import { SUN_OW } from '../../../地点/主世界光照.tsx';
import { overworldMix } from '@engine/light/光照配比.ts';
import { LiYing } from '@库/角色/李樱.tsx';
import { bladeInHand } from '@库/角色/骨架.tsx';
import { MaceInHand } from '@库/物品/重锤.tsx';
import { MechanicalRoller } from '@库/物品/动力压路机.tsx';
import { SKY } from '@engine/light/天空.tsx';
import { LiYingGoldGlow } from '../../../特效/锤击金光.tsx';
import { paletteValue } from '@库/界面/思索界面.tsx';
import {
  posKey, buildBlockGeometry, blockTexture, flipMapV, blockMaterials, Outline,
  makeRand, destroyParticle, debrisPosAt, billboardAxes, QUAD_CORNERS, debrisMaterial, PonderUiLayer, CloseClick,
} from '@库/界面/思索场景.tsx';
import { sheath } from '../../../地点/边城/6-2-5/飞越主世界.tsx';
import { FallScene } from '../../../场/6-边城/6-3-下坠/画面.tsx';
import { FallSound } from '../../../场/6-边城/6-3-下坠/声音.tsx';
import { 段表, 刻, 李樱下落 } from '../../../地点/边城/6-3-下坠/时间线.ts';
import * as LY from '../../../地点/边城/6-3-下坠/编排/李樱.ts';
import { liYingHip } from '../../../地点/边城/6-3-下坠/编排/金光.ts';
import * as choreo from '../../../地点/边城/6-3-2/编排.ts';
import { activeLine, voiceStart, uiOpen, chosenVersion } from '../../../地点/边城/6-3-2/台词.ts';
import { glowCamAt, ponderCamAt, ponderLayerOpacity, tMatch, transitionW } from '../../../地点/边城/6-3-2/转场.ts';
import { lineVolume } from '@engine/audio/混音.ts';
import { 清单Audio } from '@engine/audio/声音Sequence.tsx';
import ponderText资产 from 'asset:数据/镜头/6-3-2/文案';
import voiceOriginal from 'asset:配音/镜头/6-3-2/李樱-压路机-原文';
import voiceFiveLines from 'asset:配音/镜头/6-3-2/李樱-压路机-五句';
import voiceRevised from 'asset:配音/镜头/6-3-2/李樱-压路机-改字';
import { 资产目录 } from '@engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/镜头/6-3-2/方块/平滑石台阶侧';
import 资_1 from 'asset:贴图/镜头/6-3-2/方块/平滑石头';
import 资_2 from 'asset:贴图/镜头/6-3-2/方块/泥土';
import 资_3 from 'asset:贴图/镜头/6-3-2/方块/深板岩';
import 资_4 from 'asset:贴图/镜头/6-3-2/方块/深板岩顶';
import 资_5 from 'asset:贴图/镜头/6-3-2/方块/白色混凝土';
import 资_6 from 'asset:贴图/镜头/6-3-2/方块/石头';
import 资_7 from 'asset:贴图/镜头/6-3-2/方块/裂纹0';
import 资_8 from 'asset:贴图/镜头/6-3-2/方块/裂纹1';
import 资_9 from 'asset:贴图/镜头/6-3-2/方块/裂纹2';
import 资_10 from 'asset:贴图/镜头/6-3-2/方块/裂纹3';
import 资_11 from 'asset:贴图/镜头/6-3-2/方块/裂纹4';
import 资_12 from 'asset:贴图/镜头/6-3-2/方块/裂纹5';
import 资_13 from 'asset:贴图/镜头/6-3-2/方块/裂纹6';
import 资_14 from 'asset:贴图/镜头/6-3-2/方块/裂纹7';
import 资_15 from 'asset:贴图/镜头/6-3-2/方块/裂纹8';
import 资_16 from 'asset:贴图/镜头/6-3-2/方块/裂纹9';
import 资_17 from 'asset:贴图/镜头/6-3-2/方块/雪块';
const ponderText = ponderText资产 as unknown as { 标题: string; 说明: string[] };

const voiceWav = { 改字: voiceRevised, 原文: voiceOriginal, 五句: voiceFiveLines }[chosenVersion];

const TEX = pngDir(资产目录({ './平滑石台阶侧.png': 资_0, './平滑石头.png': 资_1, './泥土.png': 资_2, './深板岩.png': 资_3, './深板岩顶.png': 资_4, './白色混凝土.png': 资_5, './石头.png': 资_6, './裂纹0.png': 资_7, './裂纹1.png': 资_8, './裂纹2.png': 资_9, './裂纹3.png': 资_10, './裂纹4.png': 资_11, './裂纹5.png': 资_12, './裂纹6.png': 资_13, './裂纹7.png': 资_14, './裂纹8.png': 资_15, './裂纹9.png': 资_16, './雪块.png': 资_17 })) as Record<string, Png>;

// ---------- 场景板的方块 ----------
// 每种方块每个面用哪张贴图（平滑石台阶的侧面只用下半张：原版 block/slab 的 side uv 是 [0, 8, 16, 16]）
const textureName = (kind: choreo.BlockKind, normal: number[]) => {
  switch (kind) {
    case '平滑石台阶':
      return normal[1] !== 0 ? '平滑石头' : '平滑石台阶侧';
    case '深板岩':
      return normal[1] !== 0 ? '深板岩顶' : '深板岩';
    default:
      return kind;
  }
};
const blockHeight = (kind: choreo.BlockKind) => (kind === '平滑石台阶' ? 0.5 : 1);

// 按「哪些方块还在」建几何：只和同一段的比，免得地面落下来那一下底板上缺一块面
const buildGeometry = (remaining: choreo.Block[], part: '底板' | '地面') =>
  buildBlockGeometry(
    remaining.filter((block) => block.part === part),
    (block, normal) => textureName(block.kind, normal),
    (block) => blockHeight(block.kind),
  );
const blockMaterial = blockMaterials(TEX);

const PartMesh: React.FC<{ part: '底板' | '地面'; t: number }> = ({ part: part, t }) => {
  const brokenLayers = choreo.layerBreaks.filter((c) => t >= c.t).length;
  const geometries = useMemo(() => buildGeometry(choreo.blocks.filter((b) => !choreo.blockGone(b, t)), part), [part, brokenLayers]);
  const { opacity, offset: offset } = choreo.dropIn(part, t);
  if (opacity <= 0) return null;
  return (
    <group position={[0, offset, 0]}>
      {geometries.map(({ name, geo }) => (
        <mesh key={name} geometry={geo} material={blockMaterial(name, opacity)} />
      ))}
    </group>
  );
};

// 裂纹：正在裂的方块，看得见的面上叠一层 destroy_stage（原版 crumbling 是正片叠底；这里用半透明叠，深色裂纹一样看得出）
const crackMaterials = Array.from({ length: 10 }, (_, i) =>
  flipMapV(new THREE.MeshBasicMaterial({ map: blockTexture(TEX[`裂纹${i}`]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
);
const CrackMesh: React.FC<{ t: number }> = ({ t }) => {
  const cracking = choreo.blocks.filter((b) => choreo.crackProgress(b, t) > 0 && t < choreo.breakSecOf(b));
  if (!cracking.length) return null;
  const stage = Math.min(9, Math.floor(choreo.crackProgress(cracking[0], t) * 10));
  const geos = buildGeometry(cracking, '地面');
  return (
    <>
      {geos.map(({ name, geo }) => (
        <mesh key={name} geometry={geo} material={crackMaterials[stage]} />
      ))}
    </>
  );
};

// ---------- 李樱（场景坐标，放在转过 −90° 的 group 里；摆法见 编排.ts 的 `figureAt`） ----------
// 灯同 6-3-下坠/画面.tsx 地面以上那套（日光、天光、环境光），日光方向跟着他一起转 ψ，所以他身上的明暗和底下真的那个一样（场景板的方块不受光）
const PonderLights: React.FC = () => {
  const sun = useMemo(() => new THREE.Vector3(...SUN_OW).normalize().applyMatrix4(choreo.figureRef().psi), []);
  return (
    <>
      <directionalLight position={[sun.x, sun.y, sun.z]} color={SKY.sunLight} intensity={overworldMix.直射} />
      <hemisphereLight args={[SKY.skyLight, SKY.groundLight, overworldMix.天光]} position={[0, 0, 1]} />
      <ambientLight intensity={overworldMix.环境光} />
    </>
  );
};
const PonderLiYing: React.FC<{ t: number }> = ({ t }) => {
  const w = transitionW(t);
  const f = choreo.figureAt(t, w);
  if (!f.visible) return null;
  const state = { pose: f.pose, matrix: f.matrix, maceAngle: f.maceAngle, maceHeld: 1, ghost: f.ghost, hip: f.hip };
  const phantom =
    f.ghost > 0.01 ? (
      <group rotation={[Math.PI, 0, 0]} scale={LY.rollerGhostScale}>
        <MechanicalRoller ghost opacity={f.ghost} />
      </group>
    ) : undefined;
  const mace = (
    <group quaternion={bladeInHand(f.pose, f.maceAngle)}>
      <MaceInHand headSlot={phantom} glow={f.glow} />
    </group>
  );
  // 金光的光尾：沿他走过的路往回取点，平移到锤头上（同 6-3-下坠/画面.tsx）。转场里取下坠里的路（转 ψ、接到推近完的髋上），场景板上取这里往下掉的路。
  // 转场里光尾跟着思索层淡掉的进度从无长出来：推完时他停在底板上没有光尾，全局帧 0 一下子冒出整条会跳
  const head = LY.maceHeadPos(state);
  const off = [head[0] - f.hip[0], head[1] - f.hip[1], head[2] - f.hip[2]];
  const speed = w !== undefined && w > 刻.leap ? Math.hypot(...李樱下落(w).v) : 0;
  const trailSec = 0.3 * Math.min(1, 150 / Math.max(speed, 1));
  const sampleExp = 1 + Math.min(1, Math.max(0, (speed - 20) / 80));
  const pathAt = (secAgo: number): V3 => {
    if (w !== undefined) {
      const now = liYingHip(w);
      const grow = 1 - ponderLayerOpacity((t - tMatch) * choreo.FPS);
      const then = liYingHip(Math.max(刻.leap, w - secAgo * grow));
      const d = new THREE.Vector3(then[0] - now[0], then[1] - now[1], then[2] - now[2]).applyMatrix4(choreo.figureRef().psi);
      return [f.hip[0] + d.x + off[0], f.hip[1] + d.y + off[1], f.hip[2] + d.z + off[2]];
    }
    const hip = choreo.hipAt(Math.max(choreo.cues.fall, t - secAgo), f.pose);
    return [hip[0] + off[0], hip[1] + off[1], hip[2] + off[2]];
  };
  const cam = glowCamAt(t);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <PonderLights />
      <LiYingGoldGlow g={f.glow} head={head} hip={f.hip} w={w ?? t} pathAt={pathAt} trailSec={trailSec} sampleExp={sampleExp} cam={cam.pos} zoom={cam.zoom} />
      <group matrix={f.matrix} matrixAutoUpdate={false}>
        <LiYing pose={f.pose} handR={mace} hipL={sheath} />
      </group>
    </group>
  );
};

// ---------- 方块碎屑（原版 TerrainParticle，按刻算；初速度和逐刻推算见 思索场景.tsx） ----------
type Debris = { start: number; p: number[]; v: number[]; lifeTicks: number; 半: number; texName: string; uo: number; vo: number };
const debrisList: Debris[] = (() => {
  const out: Debris[] = [];
  let seed = 1;
  for (const block of choreo.blocks) {
    const tb = choreo.breakSecOf(block);
    if (!Number.isFinite(tb)) continue;
    const rand = makeRand(seed++ * 7919);
    const texName = textureName(block.kind, [1, 0, 0]);
    const height = blockHeight(block.kind);
    // ParticleEngine.destroy（addDestroyBlockEffect）：按方块形状每 0.25 格一个、每边至少 2 个，整格 4×4×4，台阶半格高、竖着只有 2 层
    const nj = Math.max(2, Math.ceil(height / 0.25));
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < nj; j++)
        for (let k = 0; k < 4; k++) {
          const dx = (i + 0.5) / 4, dy = (j + 0.5) / nj, dz = (k + 0.5) / 4;
          const { v, lifeTicks, 半 } = destroyParticle(dx, dy, dz, rand);
          out.push({
            start: tb,
            p: [block.x + dx, block.y + dy * height, block.z + dz],
            v,
            lifeTicks,
            半,
            texName: texName,
            uo: Math.floor(rand() * 3 * 4) / 16,
            vo: Math.floor(rand() * 3 * 4) / 16,
          });
        }
  }
  return out;
})();
// 碎屑撞方块：某一刻还在的方块（没碎的）算实心，台阶只算下半格
const blockIndex = new Map(choreo.blocks.map((b) => [posKey(b.x, b.y, b.z), b]));
const isSolid = (x: number, y: number, z: number, t: number) => {
  const block = blockIndex.get(posKey(Math.floor(x), Math.floor(y), Math.floor(z)));
  return !!block && t < choreo.breakSecOf(block) && y - block.y < blockHeight(block.kind);
};
// 脚下最近的实心面：从当前高度往下找这一列里第一个还在的方块的顶面；板子外面没有方块，一直掉
const groundY = (x: number, z: number, y: number, t: number) => {
  for (let by = Math.floor(y); by >= 0; by--) {
    const block = blockIndex.get(posKey(Math.floor(x), by, Math.floor(z)));
    if (block && t < choreo.breakSecOf(block) && block.y + blockHeight(block.kind) <= y + 1e-6) return block.y + blockHeight(block.kind);
  }
  return -Infinity;
};
// 碰撞按「这一刻哪些方块还在」算：落到还没碎的方块上就停住，等它碎了接着往下掉，横着撞上没砸的方块就停下水平速度
const debrisPos = (debris: Debris, t: number) => debrisPosAt(debris, debris.start, choreo.tickSec, t, groundY, isSolid);
// 碎屑在三维里画（和方块、李樱互相遮挡）：每颗是朝着镜头的小方片，中心在碎屑的位置，边长 2 × quadSize，贴图取方块贴图里随机一块 4×4 像素
const debrisMaterials = new Map<string, THREE.MeshBasicMaterial>();
const getDebrisMaterial = (name: string) => {
  let material = debrisMaterials.get(name);
  if (!material) {
    material = debrisMaterial(TEX[name]);
    debrisMaterials.set(name, material);
  }
  return material;
};
const { camRight, camUp } = billboardAxes(choreo.viewRotation);
const DebrisMesh: React.FC<{ t: number }> = ({ t }) => {
  const geos = useMemo(() => {
    const groups = new Map<string, { pos: number[]; uv: number[]; idx: number[] }>();
    for (const debris of debrisList) {
      const pos = debrisPos(debris, t);
      if (!pos) continue;
      let group = groups.get(debris.texName);
      if (!group) groups.set(debris.texName, (group = { pos: [], uv: [], idx: [] }));
      const base = group.pos.length / 3;
      for (const [cornerX, cornerY] of QUAD_CORNERS) {
        group.pos.push(pos[0] + (camRight.x * cornerX + camUp.x * cornerY) * debris.半, pos[1] + (camRight.y * cornerX + camUp.y * cornerY) * debris.半, pos[2] + (camRight.z * cornerX + camUp.z * cornerY) * debris.半);
        // DataTexture 第一行（贴图最上面）在 v = 0：方片上边对着贴图块的上边
        group.uv.push(debris.uo + (cornerX > 0 ? 0.25 : 0), debris.vo + (cornerY > 0 ? 0 : 0.25));
      }
      group.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return [...groups.entries()].map(([name, group]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(group.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(group.uv, 2));
      geo.setIndex(group.idx);
      return { name, geo };
    });
  }, [t]);
  return (
    <>
      {geos.map(({ name, geo }) => (
        <mesh key={name} geometry={geo} material={getDebrisMaterial(name)} />
      ))}
    </>
  );
};

// 标题框里的物品：动力压路机的物品模型，照 models/block/mechanical_roller/item.json 的 display.gui
// （rotation [30, 45, 0]、translation [−1.5, 2.25, 0]、scale 0.44）。
// 物品模型是 obj（格为单位、y 朝上、0～1 的方块），MechanicalRoller 的局部坐标是挪到滚筒中心、转成 z 朝上的，这里先换回 obj 坐标
const RollerItem: React.FC = () => {
  const matrix = useMemo(
    () =>
      new THREE.Matrix4()
        .makeTranslation(-1.5 / 16, 2.25 / 16, 0)
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(30 * (Math.PI / 180), 45 * (Math.PI / 180), 0, 'XYZ')))
        .multiply(new THREE.Matrix4().makeScale(0.44, 0.44, 0.44))
        .multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5))
        .multiply(new THREE.Matrix4().makeTranslation(0.5, 0, 0.8125))
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)),
    [],
  );
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <MechanicalRoller />
    </group>
  );
};

// 帧：段内第几帧（不给就是当前帧；6-3-3 开头叠思索层时接着往下数）。世界：画不画底下的世界画面（不画就是透明底）；
// 配音：放不放李樱的话（界面层不放，配音另有 wav）；按钮声：关界面那一下（只在 6-3-2 自己的时间轴上放）
export const PonderSegment: React.FC<{ world?: boolean; voice?: boolean; click?: boolean; frame?: number }> = ({ world: showWorld = true, voice: playVoice = true, click = true, frame: frameOverride }) => {
  const cur = useCurrentFrame();
  const frame = frameOverride ?? cur;
  const G = 段表['6-3-2'].起 + frame;
  const t = frame / choreo.FPS - uiOpen; // 思索场景时间（开界面以前是负的）
  // 整层（底色、场景板、李樱）：开界面时淡入盖住扫帚，6-3-3 开头淡掉露出真的俯冲；标题、按钮、说明框另外在关界面时淡掉
  const layerOpacity = G > 0 ? ponderLayerOpacity(G) : t < choreo.cues.close[0] ? choreo.uiOpacityAt(t) : 1;
  const chrome = choreo.uiOpacityAt(t);
  const sceneTime = Math.min(Math.max(t, 0), choreo.sceneDuration);
  const captions = ponderText.说明.map((text, i) => {
    const caption = choreo.captionTable[i];
    const anchor = choreo.pointerTarget(caption.pointsAt, caption.start);
    return { 字: text, ponderPalette: caption.palette, 点: anchor ? choreo.projectUi(anchor) : null, 高度: caption.height, nearTarget: caption.nearTarget ?? true, fade: choreo.captionOpacity(i, t) };
  });
  const redBox = choreo.redBoxAt(t);
  const greenBox = choreo.greenBox(t);
  return (
    <AbsoluteFill style={{ backgroundColor: showWorld ? '#000' : 'transparent' }}>
      {showWorld && layerOpacity < 1 && <FallScene G={G} segment="6-3-2" />}
      {layerOpacity > 0 && (
        <PonderUiLayer
          frame={frame}
          opacity={layerOpacity}
          view={choreo}
          title={ponderText.标题}
          progress={sceneTime / choreo.sceneDuration}
          keyframes={choreo.keyframes}
          captions={captions}
          item={<RollerItem />}
          backdrop
          chrome={chrome}
          perspective={ponderCamAt(t)}
          lights={<></>}
          toneMapping={THREE.NeutralToneMapping}
        >
          <PartMesh part="底板" t={t} />
          <PartMesh part="地面" t={t} />
          <CrackMesh t={t} />
          <PonderLiYing t={t} />
          <DebrisMesh t={t} />
          <Outline min={redBox.min} max={redBox.max} color={paletteValue('RED')} k={redBox.k} />
          <Outline min={greenBox.min} max={greenBox.max} color={paletteValue('GREEN')} k={greenBox.k} />
        </PonderUiLayer>
      )}
      {/* 李樱的配音：界面开了 `开口` 秒以后开口（取在整帧上）；音量照台词总线（台词.ts 的 `增益dB`） */}
      {playVoice && (
        <清单Audio
          kind="台词清单"
          名="6-3-2-李樱-压路机"
          src={voiceWav}
          文件={`镜头/6-3-2/${activeLine.文件}`}
          时长={activeLine.时长}
          from={Math.round((uiOpen + voiceStart) * choreo.FPS)}
          volume={lineVolume * 10 ** (activeLine.增益dB / 20)}
        />
      )}
      {/* 界面的声音只有关界面那一下按钮声，演示场景里方块碎掉也不出声 */}
      {click && <CloseClick at={Math.round((uiOpen + choreo.cues.close[0]) * choreo.FPS)} />}
      {showWorld && <FallSound segment="6-3-2" />}
    </AbsoluteFill>
  );
};

export const RollerPonder = () => <PonderSegment />;
export const RollerPonderOverlay = () => <PonderSegment world={false} voice={false} />;
