// 6-4-7 贪功的声音表（段内帧）：放在 ../6-4-7至9/声音.tsx，听者是镜头。
// - 第三次尖啸（6-4-6）到本段只剩听不见的尾巴，不接。
// - 落地、咔嗒：../6-4-6/追兵声.ts（刘心忠那一「踩」是落在幽匿块上的脚步声 block.sculk.step；咔嗒按振动链）。
// - 第四次尖啸：就用 6-4-8 开头接着放的那一声的音高和文件（6-4-8/声音.tsx 的「第四次尖啸」），声源是振动链里叫的那个尖啸体 (−869,−51,218)，
//   落在末帧前 衔接.六四八首.尖啸后秒，一直响进 6-4-8（6-4-8 那份同一声在合成段里不再放）。
// - 台词只有刘心忠那句（李樱数「四次了……」那句用户 10-10 删了）。
import type { V3 } from '@engine/model/parts.tsx';
import type { SoundCue } from '@engine/audio/游戏音效.tsx';
import { landingSounds, clickSounds } from '../../../场/6-古城/6-4-6/追兵声.ts';
import { sounds as 声们648 } from '../6-4-8/声音.tsx';
import * as choreo from './编排.ts';

const FPS = choreo.FPS;
const shriek4Sound = 声们648.find((s) => s.名 === '第四次尖啸')!;
const τ0 = choreo.τ(0);
const toSegment = (s: SoundCue[]) => s.map((x) => ({ ...x, 帧: x.帧 - τ0 * FPS })).filter((x) => x.帧 >= 0 && x.帧 < choreo.frameCount);
// 用户 10-18：刘心忠踩幽匿块引出第四次尖啸、召出监守者，是关键动作，离镜头 18 格照游戏听不见也要放：踩和黄叛跟跳落地都归「中」；
// 黄叛跟跳落地叫响的咔嗒里离镜头 17 格的那声照游戏听不见，不放（刘心忠踩的那声咔嗒同是关键，留着）
const farClicks = ['咔嗒 感测体 -868,-51,227（黄叛跟跳落地）'];
export const sounds: SoundCue[] = [
  ...toSegment(landingSounds).map((x) => ({ ...x, 档: '中' as const })),
  ...toSegment(clickSounds).filter((x) => !farClicks.includes(x.名!)),
  { ...shriek4Sound, 帧: choreo.shriekFrame, 位置: [choreo.shrieker4Pos[0], choreo.shrieker4Pos[1], choreo.shrieker4Pos[2] + 0.5] as V3 },
];
