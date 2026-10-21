// 慢放里的声音怎么排到画面上（从 镜头/6-4-3/声音.tsx 抽出来的规则，各段共用，2026-10-10）：
// - 事件落在慢放里的，从那一帧起按画面时间原速放（不跟着时钟变慢变低，慢放里的声音只是「那一刻响了」的提示）；
// - 时钟回到原速以后按剧情时间对：那时剧情时间里还没放完、但原速放的那一遍已经放完了的声音，从剧情时间响到的地方接着放。
// 输入的事件带剧情时间 T（秒），时间线给出 剧情时间 ↔ 全局帧 和时钟；输出 游戏声音轨 用的 一声（帧 = 全局帧，带小数）。
import { resolveSound, type SoundCue } from './游戏音效.tsx';

export type 时间线 = {
  FPS: number;
  总帧数: number;
  帧小数: (storySec: number) => number; // 剧情时间 → 全局帧（带小数）
  剧情时间: (globalFrame: number) => number; // 全局帧 → 剧情时间
  时钟: (storySec: number) => number; // 画面 1 秒 = 多少剧情秒
};
// 起点：剪过的声音从文件第几秒放起（如一镜到底的九头蛇死亡声跳过前奏），接着放的余音在这上面接着算
export type StoryEvent = Omit<SoundCue, '帧'> & { T: number };
export const normalSpeed = 0.99; // 时钟到这么多就算回到原速

export const scheduleToScreen = (events: StoryEvent[], L: 时间线): SoundCue[] =>
  events.flatMap(({ T: storySec, ...soundProps }) => {
    const globalFrame = L.帧小数(storySec);
    const firstPass: SoundCue = { ...soundProps, 帧: globalFrame };
    if (L.时钟(storySec) >= normalSpeed) return [firstPass];
    const resolved = resolveSound(firstPass);
    let gr = Math.ceil(globalFrame);
    while (gr < L.总帧数 && L.时钟(L.剧情时间(gr)) < normalSpeed) gr++;
    const playedSec = (soundProps.起点 ?? 0) + (L.剧情时间(gr) - storySec) * resolved.pitch; // 剧情时间里到这一帧已经放到文件的第几秒
    const firstPassEnd = globalFrame + resolved.durationSec * L.FPS;
    if (gr >= L.总帧数 || playedSec >= resolved.file.时长 || firstPassEnd > gr) return [firstPass];
    // 接着放的那一截是动作那一刻的余音，不算主要动作（不吃 混音.ts 的衰减下限），照游戏规则跟着远近走：镜头没给档的归「细节」，不按默认档响（这时镜头多半已经离远了）
    return [firstPass, { ...soundProps, 名: `${soundProps.名 ?? soundProps.事件}（接着放）`, 帧: gr, 起点: playedSec, major: false, 档: soundProps.档 ?? '细节' }];
  });
