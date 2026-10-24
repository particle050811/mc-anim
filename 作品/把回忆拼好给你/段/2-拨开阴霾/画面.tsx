// 2-拨开阴霾 的画面：场/2-雷雨/画面.tsx 的 雷雨画面 按歌曲帧画（接着 2-雷雨 那个镜头），配原声、信标声、雨声（接上一段放到雨停）。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { 段窗口 } from '../../分镜.ts';
import { 雷雨画面 } from '../../场/2-雷雨/画面.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 音效轨 } from '../../声音/音效轨.tsx';
import 段 from './段.ts';
import 信标url from 'asset:音效/把回忆拼好给你/block.beacon.activate';
import 雨1 from 'asset:音效/把回忆拼好给你/weather.rain.1';
import 雨2 from 'asset:音效/把回忆拼好给你/weather.rain.2';
import 雨3 from 'asset:音效/把回忆拼好给你/weather.rain.3';
import 雨4 from 'asset:音效/把回忆拼好给你/weather.rain.4';

const 起帧 = 段窗口('2-拨开阴霾').起帧;
/** 段里有 cue 的才放（雨声按歌上排，这一段只落到其中几个文件） */
const 音效们: readonly [string, string][] = [
  ['音效/把回忆拼好给你/block.beacon.activate', 信标url],
  ['音效/把回忆拼好给你/weather.rain.1', 雨1],
  ['音效/把回忆拼好给你/weather.rain.2', 雨2],
  ['音效/把回忆拼好给你/weather.rain.3', 雨3],
  ['音效/把回忆拼好给你/weather.rain.4', 雨4],
];

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      {音效们
        .filter(([id]) => 段.声音?.some((c) => (c as { 资产?: string }).资产 === id))
        .map(([id, src]) => (
          <音效轨 key={id} src={src} 资产={id} 段={段} />
        ))}
      <雷雨画面 帧={起帧 + f} />
    </>
  );
};

export default 画面;
