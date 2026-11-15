// 正片第 15 句后半（49.54–52.94），隐世之境你的视角一镜到底：风散开、她转过来 → 对视（封面这一刻）→ 递蛋糕、驯服、她笑、头上冒台词气泡，一路慢慢推向她的脸。画法在 场/2-隐世之境/重逢.tsx（按歌曲帧画）。
// 叠层（整片后期里面）：上一段卷过来的樱花风（转场后从 风散心 散开，花瓣接着上一镜的位置飞），上面是符文歌词和接过来的聊天行。
// 歌词：15 句都交给符文歌词（这一段里只剩第 15 句「爱炙热的你却忘了爱自己」），放在画面底部（第 15 句的特例，同 2-摇铃、2-归隐、2-合照），接着上一段、留到段尾接 15 尾。
// 驯服起她头上的台词气泡「您的手艺，一如既往呢」（重逢画面 自己画）和底部歌词同时在：两路字是用户 10-25 要的，气泡在上、歌词在下不重叠。
// 左下那行「Steve加入了游戏」从上一段接过来（同一个 加入游戏聊天），风散开时跟着花瓣淡掉（重逢动作.ts 的 聊天行不透明）：
// 文字一时只走一路（用户 10-24 点名这一帧气泡、聊天行、歌词三路字一起出），接缝那一帧又不能一下没了。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { fps } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第15句.ts';
import { shadingBySeg } from '../../默认.ts';
import { palette } from '../../色板.ts';
import { RuneLyric } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { SakuraWind } from '../../特效/樱花风.tsx';
import { line15RuneStyle } from '../../场/2-门口/归隐歌词.ts';
import { JoinGameChat, bellWind, bellInPicture } from '../../场/2-门口/摇铃.tsx';
import { ReunionPicture, windScatterCenter } from '../../场/2-隐世之境/重逢.tsx';
import { chatLineOpacity, reunionRig } from '../../场/2-隐世之境/重逢动作.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useCurrentFrame } from '../../当前帧.ts';

const segKey = '2-重逢';
const startFrame = segClock(segKey).起帧;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));
const lyricStyle = { ...line15RuneStyle, outlineColor: palette['归隐之地'].outlineColor };
/** 太阳整段按第 57 帧的镜头朝向摆（用户 11-03 核脸补光看的那一帧，那一帧和原来一样）。原来跟着每帧的镜头转，推镜一路往右转，
 *  地毯上的影子边跟着一格一格地爬（用户 11-03「这边边缘像素为什么光影会乱动？」） */
const referenceRig = reunionRig((startFrame + 57) / fps);
const shadingScene = { sunRefDir: [referenceRig.看[0] - referenceRig.眼[0], referenceRig.看[1] - referenceRig.眼[1], referenceRig.看[2] - referenceRig.眼[2]] as const };

const picture: React.FC = () => {
  const f = useCurrentFrame();
  const frame = startFrame + f;
  const chatAlpha = chatLineOpacity(frame / fps);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* 光影照 默认.ts 的 光影段（甲版不开，乙版开 Agent 建议的） */}
      <shadingScope.Provider value={{ shading: shadingBySeg[segKey] }}>
        <ReunionPicture
          帧={frame}
          种子={f}
          shadingScene={shadingScene}
          叠层={
            <>
              <SakuraWind 秒={frame / fps} windTime={bellWind} 源={bellInPicture} scatterCenter={windScatterCenter} />
              <RuneLyric lines={lyricLines} 样式={lyricStyle} />
              {chatAlpha > 0 && (
                <div style={{ position: 'absolute', inset: 0, opacity: chatAlpha }}>
                  <JoinGameChat 帧={frame} />
                </div>
              )}
            </>
          }
        />
      </shadingScope.Provider>
    </AbsoluteFill>
  );
};

export default definePicture(seg, soundUrl, picture);
