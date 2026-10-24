// 2-雷雨 的画面：炸成坑的门口剖面（场/2-雷雨/坑景.tsx，N = 12，正交斜投影），雷雨夜；她坐在坑沿、你蹲在台阶上，炸出来的掉落物浮在坑里，
// 原版的雨一列一列落，闷雷那一拍闪两下；她头顶的气泡叠在画布上，女仆界面浮在最上面。整片后期包住画面、界面和符文歌词（歌词也过后期，同 核对-歌词艺术字小样）。
// 谁在哪、什么姿势全在 编排.ts，这里只按它画。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { 女仆气泡, 女仆气泡锚高 } from '@库/界面/女仆气泡.tsx';
import { 段窗口, 画幅 } from '../../分镜.ts';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 画布调子, 正交顶面 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 坑景天色 } from '../../场/2-雷雨/调子.ts';
import { 坑画布 } from '../../场/2-雷雨/坑景.tsx';
import * as 参 from '../../场/2-雷雨/参数.ts';
import { 掉落物们 as 掉落物组 } from '../../场/2-雷雨/掉落物.tsx';
import { 坑沿的她 } from '../../场/2-雷雨/她.tsx';
import { 女仆界面 } from '../../场/2-雷雨/女仆界面.tsx';
import { 雨 } from '../../场/2-雷雨/雨.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 她态, 你态, 取景, 帽挡雨, 掉落刻, 掉落物们, 歌曲帧, 歌秒, 气泡态, 界面态, 闪, 雨片们 } from './编排.ts';
import 段 from './段.ts';
import 雷url from 'asset:音效/entity.lightning_bolt.thunder.2';
import 雨1 from 'asset:音效/把回忆拼好给你/weather.rain.1';
import 雨2 from 'asset:音效/把回忆拼好给你/weather.rain.2';
import 雨3 from 'asset:音效/把回忆拼好给你/weather.rain.3';
import 雨4 from 'asset:音效/把回忆拼好给你/weather.rain.4';

const 宽 = 画幅.宽, 高 = 画幅.高;
const 调子 = 色板.雷雨;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 段窗口('2-雷雨').起帧));
const 掉落 = 掉落物们();
/** 段里有 cue 的才放（雨声按歌上排，这一段只落到其中几个文件） */
const 音效们: readonly [string, string][] = [
  ['音效/entity.lightning_bolt.thunder.2', 雷url],
  ['音效/把回忆拼好给你/weather.rain.1', 雨1],
  ['音效/把回忆拼好给你/weather.rain.2', 雨2],
  ['音效/把回忆拼好给你/weather.rain.3', 雨3],
  ['音效/把回忆拼好给你/weather.rain.4', 雨4],
];

const 场景: React.FC<{ f: number }> = ({ f }) => {
  const 她 = 她态(f);
  const 你 = 你态(f);
  const 你姿 = { ...stevePose(你.loc, 你.yaw, { headYaw: 你.headYaw, headPitch: 你.headPitch, crouch: 1, scale: 1 }), armRRoll: 0, armLRoll: 0 };
  const 景 = 取景(f);
  const 半宽 = (宽 / 2) * 成片倍数 / 景.每格;
  const 亮 = 闪(f);
  return (
    <>
      <贴图像素对齐 锚={你姿.loc as V3}>
        <Steve pose={你姿} />
      </贴图像素对齐>
      <坑沿的她 态={她} />
      <掉落物组 们={掉落} 刻={掉落刻(f)} />
      <雨 片们={雨片们([景.中心[0] - 半宽, 景.中心[0] + 半宽], 帽挡雨(f))} 刻={歌秒(f) * 20} 色={亮 ? 参.雨色.闪 : 参.雨色.平时} 粗={参.雨粗} />
    </>
  );
};

const 气泡: React.FC<{ f: number }> = ({ f }) => {
  const 泡 = 气泡态(f);
  if (!泡) return null;
  const [x, y, z] = 参.站位.她;
  const 锚 = 侧投影(取景(f), 宽, 高, 正交顶面)(x, z + 女仆气泡锚高(true), y);
  return <女仆气泡 锚={锚} 缩放={参.坑镜头N} 文字={泡.字} 字体={像素字} 锚对齐={参.坑镜头N} />;
};

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 亮 = 闪(f);
  const 界 = 界面态(f);
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      {音效们
        .filter(([id]) => 段.声音?.some((c) => (c as { 资产?: string }).资产 === id))
        .map(([id, src]) => (
          <音效轨 key={id} src={src} 资产={id} 段={段} />
        ))}
      <整片后期 调色={调子.调色} 种子={歌曲帧(f)}>
        <坑画布
          取景={取景(f)}
          天色={坑景天色(亮)}
          色调={亮 ? 参.闪电.色调 : 调子.色调}
          描边={画布调子('雷雨').描边}
          叠层={<气泡 f={f} />}
        >
          <场景 f={f} />
        </坑画布>
        {界 && <女仆界面 态={界} 她={她态(f)} />}
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 调子.描边 }} />
      </整片后期>
    </>
  );
};

export default 画面;
