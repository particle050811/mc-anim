// 核对-法术录制 的画面：三格同一个场景（照 核对-法术演出：灰底、地面、目标处的史蒂夫、起点的小白球），只换法术的画法，见 视图.ts。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckGround, checkGrey, NeutralLights, ZUp } from '@engine/段/核对画面.tsx';
import { png, type Png } from '@engine/model/贴图.ts';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { SpellPerformance } from '../../法术/演出/注册表.tsx';
import { RecordingReplay, readRecording, type SpellRecording } from '../../法术/演出/零件/录制回放.tsx';
import { panelSize, aspect, target, seed, viewAt, castFrom } from './视图.ts';
import weakeningRecording from 'asset:录制/法术/goety/weakening';
import frostNovaRecording from 'asset:录制/法术/goety/frost_nova';
import ringShockwavePng from 'asset:贴图/法术/goety/particle/shockwave';
import trailPng from 'asset:贴图/法术/goety/particle/trail';
import frost1Png from 'asset:贴图/法术/goety/particle/frost_1';
import frost2Png from 'asset:贴图/法术/goety/particle/frost_2';
import frost3Png from 'asset:贴图/法术/goety/particle/frost_3';
import frost4Png from 'asset:贴图/法术/goety/particle/frost_4';
import frost5Png from 'asset:贴图/法术/goety/particle/frost_5';
import frost6Png from 'asset:贴图/法术/goety/particle/frost_6';

const recordings: Record<string, SpellRecording> = { weakening: readRecording(weakeningRecording), frost_nova: readRecording(frostNovaRecording) };
const textureMap: Record<string, Png> = {
  'goety:shockwave': png(ringShockwavePng),
  'goety:trail': png(trailPng),
  ...Object.fromEntries([frost1Png, frost2Png, frost3Png, frost4Png, frost5Png, frost6Png].map((x, i) => [`goety:frost_${i + 1}`, png(x)])),
};

type DrawMethod = '手写' | '录制·轨' | '录制·算';

const SampleCell: React.FC<{ 画法: DrawMethod }> = ({ 画法: drawMethod }) => {
  const v = viewAt(useCurrentSec());
  const recording = recordings[v.meta.id]!;
  const feet = [castFrom[0], castFrom[1], castFrom[2] - v.startHeight] as const;
  return (
    <div style={{ position: 'relative', width: panelSize.width, height: panelSize.height }}>
      <CheckCanvas width={panelSize.width} height={panelSize.height} background={checkGrey.background} antialias={false}>
        <CheckCamera eye={v.cameraRig.眼} target={v.cameraRig.看} fov={v.cameraRig.fov} />
        <ZUp>
          <NeutralLights />
          <CheckGround size={160} />
          <Steve pose={stevePose([target[0], target[1], target[2]], 90)} mcLight={1} hurt={0} />
          <mesh position={[castFrom[0], castFrom[1], castFrom[2]]}>
            <sphereGeometry args={[0.08, 12, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {drawMethod === '手写' ? (
            <SpellPerformance id={v.meta.id} sec={v.sec} from={castFrom} target={target} seed={seed} />
          ) : (
            <RecordingReplay 录制={recording} sec={v.sec} feet={feet} target={target} 贴图={textureMap} animMode={drawMethod === '录制·算' ? '算' : '轨'} />
          )}
        </ZUp>
      </CheckCanvas>
      <div style={{ position: 'absolute', left: 12, top: 8, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 20, textShadow: '0 1px 3px #000' }}>{drawMethod}</div>
    </div>
  );
};

const picture: React.FC = () => {
  const v = viewAt(useCurrentSec());
  return (
    <AbsoluteFill style={{ background: '#5a5e66', width: aspect.width, height: aspect.height }}>
      <div style={{ display: 'flex' }}>
        <SampleCell 画法="手写" />
        <SampleCell 画法="录制·轨" />
        <SampleCell 画法="录制·算" />
      </div>
      <div style={{ position: 'absolute', left: 12, bottom: 8, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 18, textShadow: '0 1px 3px #000' }}>
        {v.meta.id}　{v.cameraRig.name}　出手后 {v.sec.toFixed(2)} 秒（第 {(v.sec * 20).toFixed(1)} 刻）／长秒 {v.长秒.toFixed(2)}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
