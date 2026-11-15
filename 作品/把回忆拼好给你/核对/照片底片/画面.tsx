// 照片底片核对的画面：按视图表一帧画一张照片的干净帧（整页就是成片那一帧，不写名字）。各场自己的干净画法，这里只挑帧、关后期。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { shadingBySeg } from '../../默认.ts';
import { events as mainCutLine3Events } from '../../分镜/正片第3句.ts';
import { events as mainCutLine5Events } from '../../分镜/正片第5句.ts';
import { AltarPicture } from '../../场/2-祭坛/祭坛.tsx';
import { SunsetRowingPhoto } from '../../场/2-海上/海上.tsx';
import { EndShot } from '../../场/2-末地/镜头.tsx';
import { events as endEvents } from '../../场/2-末地/编排.ts';
import { BeamBreakCloudPicture } from '../../场/2-雷雨/画面.tsx';
import { photoFrame } from '../../场/2-门口/门口之夜参数.ts';
import { DoorNightCanvas } from '../../场/2-门口/门口之夜画布.tsx';
import { GroupPhotoPrint } from '../../场/2-隐世之境/合照.tsx';
import { filmViews, type PhotoName } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const mainCutEvents = { ...mainCutLine3Events, ...mainCutLine5Events };

const negativeRenders: Record<PhotoName, () => React.ReactNode> = {
  递蛋糕: () => <AltarPicture g={mainCutEvents['照片-祭坛递蛋糕'].帧} />,
  日落划船: () => <SunsetRowingPhoto withPost={false} />,
  扑龙蛋: () => <EndShot f={endEvents['照片-扑龙蛋']} clean withPost={false} />,
  // 照段 2-拨开阴霾 开光影：天和云是那一段的 Photon 雨云（用户 11-03「后面一个镜头的云怎么还是原版？」，照片墙上这张跟着换）
  光柱破云: () => (
    <shadingScope.Provider value={{ shading: shadingBySeg['2-拨开阴霾'] }}>
      <BeamBreakCloudPicture withPost={false} />
    </shadingScope.Provider>
  ),
  合照: () => <DoorNightCanvas 帧={photoFrame} />,
  新合照: () => <GroupPhotoPrint withPost={false} />,
};

const picture: React.FC = () => <AbsoluteFill style={{ background: '#000000' }}>{negativeRenders[filmViews[useViewIndex()]!.名]()}</AbsoluteFill>;

export default picture;
