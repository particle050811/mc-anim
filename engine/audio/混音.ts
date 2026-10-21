import { getInputProps } from 'remotion';

// 去台词开关（默认关）：只在 工具/剪辑微调/导出剪辑包.py --正式 / --渲去台词 时打开，渲染时给 --props='{"去台词":true}'，台词总线整条静音，别的原样。
// 拼出来是整片去掉台词以后的声音，台词另按各句的落点和增益铺成片段，给用户在剪辑软件里拖着试节奏（用户 10-11 要求）
function stripped(bus: '去台词'): boolean {
  try {
    return Boolean((getInputProps() as Record<string, unknown>)[bus]);
  } catch {
    return false; // 诊断脚本在 node 里跑，没有 Remotion 环境
  }
}

// 三条声音总线的相对大小（第 6 章配音、音效、配乐一起上以后定）。整片最后再统一拉到 -16 LUFS（工具/合成第六章.py），这里只管三者之间的比例：
// - 台词：src/配音/ 的每句已经按 EBU R128 拉到 -18 LUFS，原样放（台词音量 1）。
// - 配乐：整条固定小 12 dB（用户 10-10 定：音乐不能盖住人声；按人声实时压配乐会一起一伏像互相干扰，用户明确说直接叠加，所以不做说话时才压的闪避）。
// - 音效：原版音效按游戏的音量和距离衰减放（src/音效/游戏音效.tsx），增益 1 的声音（雷、尖啸、监守者）原文件峰值到 0 dBFS 上下，和台词放一起会盖住台词，整条小 6 dB。
export const lineVolume = stripped('去台词') ? 0 : 1;
export const musicVolume = 10 ** (-12 / 20);
export const sfxVolume = 10 ** (-6 / 20);

// 主要动作的距离衰减下限（**这是为参考视频听得见做的偏离，不是游戏行为**；分档以后只管「细节」档里的主要动作）：照游戏的线性衰减、听者是镜头，好几处主要动作在远景里完全听不见（6-1-2 俯拍斩娜迦、6-1-6 九头蛇、6-1-8b 巨人、6-4-3 切到黄叛后的尖啸）。
// 所以主要动作（主角和 boss 的攻击、命中、受伤、死亡，方块被打穿砸穿，尖啸、监守者钻出……，哪些算见 游戏音效.tsx 的 `isMajorAction`）按规则算出的增益低于 −12 dB 时取 −12 dB（不超过这一声本身不衰减时的增益）；
// 环境声、脚步、拾取等次要声音照游戏规则衰减。想全按游戏规则：把 `majorActionFloorOn` 改成 false。
export const majorActionFloorOn = true;
export const majorActionFloor = 10 ** (-12 / 20);

// 脚步照游戏的音量（0.15）和 16 格线性衰减放，远景里基本听不见，没有下限（用户 10-11 看了加下限的版本说脚步声太假）。

// 音效分档（用户 10-18：游戏的音量 × 距离衰减听着不对，按剧情要多响手动定每声的平均响度，不靠撞击速度之类的公式算）：
// 一声给了 `档`（或直接给 `响度`，LUFS）就不走上面的游戏规则和下限，增益 = 目标响度 − 这个文件自己的有声平均响度（src/音效/音效响度.json，工具/游戏取材/音效响度.py 量的），
// 再乘一点远近感（`distanceFeel`）。剪映里的片段名都带档（用户 10-18 要在剪映里逐个听）。没给档的按 `defaultTier` 归档。
// 目标是在音效总线上的响度、不再乘 `sfxVolume`；台词 −18 LUFS，整片最后统一拉响度。初值用户 10-18 说先填、听了再改
// 用户 10-18 听了整章分档的初值后改成：重 −10，脚步 −30（「脚步声还是太大了」），原来的持续、细节、各声直接给的数都归中。
// 「细节」只留给慢放回到原速后接着放的余音（慢放.ts）：照游戏规则跟着远近走，不按档再响一遍
export type 音效档 = '重' | '中' | '脚步' | '细节';
export const tierLoudness: Record<Exclude<音效档, '细节'>, number> = {
  重: -10, // 招架、尖啸、boss 死、爆炸：比台词响
  中: -20, // 其余：和台词差不多
  脚步: -30, // 走、跑、起跳落地的 step 声；剧情上算落地动作的在镜头里给「中」
};
// 没给档的声音按事件归档（初值；用户 10-18 让整章都分档，按剧情要改的在镜头里给 `档`）。从上往下第一条对上的算；循环声（LoopSound）不走这里
const tierRules: [RegExp, 音效档][] = [
  [/death|shriek|warden\.(roar|sonic_boom)|parry|explode|lightning_bolt|attack_impact|force_impact/, '重'],
  [/\.step$/, '脚步'],
  [/./, '中'],
];
export const defaultTier = (event: string): 音效档 => tierRules.find(([re]) => re.test(event))![1];
// 远近感：只留一点（用户 10-18：「距离只留一点远近感」），0～50 格线性小到 −6 dB，再远不再小
export const distanceFeel = (dist: number) => 10 ** ((-6 * Math.min(1, dist / 50)) / 20);

// 跨硬切的连续声音（同一条风声、呼啸、环境底，两边远近不同）：切点不跳，前一镜的包络淡出、后一镜的淡入，在 [切 − 前, 切 + 后) 里重叠
// （用户 10-20：「上一段淡出 下一段淡入 中间重叠一段」）。重叠里前一镜停在切前最后一帧的值、后一镜停在切后第一帧的值，按 smoothstep 等增益交叉：
// 两边是同一条循环、同相位，等功率交叉会在中间鼓起 3 dB。后比前长：变化主要落在新画面上（L 切），切前只先降一点。
// 包络按全局帧算，各段渲自己那一截，剪映清单和成片是同一份增益。哪些切点用了：6-3-3 → 6-3-4 切城墙（6-3-下坠/声音.tsx）
export const cutCrossfade = { 前: 6, 后: 12 };
export const acrossCut =
  (before: (frame: number) => number, after: (frame: number) => number, cut: number, { 前, 后 } = cutCrossfade) =>
  (frame: number) => {
    const k = Math.min(1, Math.max(0, (frame - (cut - 前)) / (前 + 后)));
    const w = k * k * (3 - 2 * k);
    if (w <= 0) return before(frame);
    if (w >= 1) return after(frame);
    return (1 - w) * before(Math.min(frame, cut - 1)) + w * after(Math.max(frame, cut));
  };
