// 2-空床 的画面：卧室侧剖面（场/2-卧室/卧室.tsx 的 卧室画布，N = 26），两张床、窗光，她一个人；外面整片后期，符文歌词（全片 15 行，按歌自己进出）浮在最上面、一起过后期。
// 开头不到半秒从 2-截图下线 最后的下线画面化进来（场/2-卧室/参数.ts 的 开场化秒）。
// 谁在哪、什么姿势、窗光哪一档、镜头挪到哪、屋外和后期怎么接 2-时差 全在 编排.ts，这里只按它画。全片不描边（用户 10-24 定）：她单独套一层平涂，色调比屋里提亮（编排.ts 的 她色调）。
import type React from 'react';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { FlatShade } from '@engine/三渲二/平涂.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFoxEx, magicalWineFoxExBones, type MagicalWineFoxExProps } from '@库/角色/魔法酒狐新动作组件.tsx';
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { hatLift, openingSceneMorphSec, wearsHat } from '../../场/2-卧室/参数.ts';
import { dayShadingScene } from '../../场/2-门口/参数.ts';
import { BedroomCanvas } from '../../场/2-卧室/卧室.tsx';
import { DoorwayNightPhoto } from '../../场/2-门口/门口之夜照片.tsx';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { shadingBySeg } from '../../默认.ts';
import { shadingSceneAt, lightState, postGrade, LiYingState, herTone, outdoorState, toSongFrame, shotAt } from './编排.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, toSongFrame(0)));

/** 帽子整顶往上抬 帽子抬（同 场/2-隐世之境/对视.tsx 的做法），在组件摆好的 witchcap 上加 */
const raiseCap = (p: MagicalWineFoxExProps): BonePose => {
  const w = magicalWineFoxExBones(p).witchcap ?? {};
  const [px = 0, py = 0, pz = 0] = (w.pos as number[] | undefined) ?? [];
  return { ...w, pos: [px, py + hatLift, pz] };
};

const LiYing: React.FC<{ f: number; tint: string }> = ({ f, tint }) => {
  const s = LiYingState(f);
  const p: MagicalWineFoxExProps = {
    pose: { ...standPose(s.loc), yaw: s.yaw },
    stancePose: '静站',
    expression: s.expression,
    看: s.看,
    blink: 0,
    hat: wearsHat,
    backStaff: false,
    skeleton: s.skeleton,
  };
  return (
    <FlatShade tint={tint}>
      <TexturePixelAlign 锚={s.loc}>
        <MagicalWineFoxEx {...p} skeleton={{ ...s.skeleton, ...(wearsHat ? { witchcap: raiseCap(p) } : {}) }} />
      </TexturePixelAlign>
    </FlatShade>
  );
};

/** 开头 开场化秒 盖在卧室上的第 11 句末画面（照 2-截图下线 按歌曲帧接着画，最后一帧之后图标、聊天栏不动），不透明度两头慢地退到 0（第一帧已经退了一帧） */
const LogoffAfterimage: React.FC<{ f: number }> = ({ f }) => {
  if (f / fps >= openingSceneMorphSec - 1e-9) return null;
  const t = (f / fps + oneFrameSec) / (openingSceneMorphSec + oneFrameSec);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - t * t * (3 - 2 * t) }}>
      <DoorwayNightPhoto 帧={toSongFrame(f)} />
    </div>
  );
};

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const light = lightState(f);
  return (
    <>
      <FilmPost grade={postGrade(f)} 种子={toSongFrame(f)}>
        <BedroomCanvas
          tone={light.tone}
          天={light.天}
          光={light.光}
          outsideLit={light.outsideLit}
          outside={outdoorState(f)}
          framing={shotAt(f)}
          shading={shadingBySeg['2-空床']}
          shadingScene={shadingSceneAt(f)}
          // 横移出屋看得见的林子接 2-时差 第一帧服务器那半，照它的光影；这一段不开光影时照旧不开
          outsideShading={shadingBySeg['2-空床'] ? { shading: shadingBySeg['2-时差'], shadingScene: dayShadingScene } : undefined}
        >
          <LiYing f={f} tint={herTone(light.tone.tint)} />
        </BedroomCanvas>
        <LogoffAfterimage f={f} />
        <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: light.tone.outlineColor }} />
      </FilmPost>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
