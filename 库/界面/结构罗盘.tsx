// 结构罗盘（Explorer's Compass 1.4.0）搜索远古城市的界面：游戏里一帧一帧录下来的（工具/游戏取材/结构罗盘界面.py，mcai ui op=shoot），
// 不是照着排版重画的（用户 10-12 剪映注释定：6-2-3 段内 180 帧，要加模组指南针搜索古城的画面，从游戏里获取）。
// 每帧是 1280×720、界面尺寸 2 的透明底 PNG：界面自己的半透明压暗底（Screen.renderBackground 的上下渐变，alpha 0.75～0.82）也在里面，
// 叠到画面上就是游戏里开着界面的样子。一个界面像素 = 2×2 画面像素，按画布大小整张缩放、不插值（pixelated），不糊。
// 录的过程（24 帧/秒，共 帧数 帧）：打开 → 点输入框 → 输入「远古」→ 列表只剩「远古城市」→ 点它 → 点「搜索」，界面关掉（第 帧数 帧已经不在了）。
// 光标是系统画的，游戏里没有，不画；鼠标停在哪只体现在悬停高亮上。
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import frameTableAsset from 'asset:数据/界面/结构罗盘帧表';
import { assetDir } from '../../engine/core/资产目录.ts';
// 待迁移（私有资产）：结构罗盘界面是游戏截图、私有，公开构建缺了怎么降级还没定
import compassFrame00Png from 'asset:贴图/界面/结构罗盘/帧-00';
import compassFrame01Png from 'asset:贴图/界面/结构罗盘/帧-01';
import compassFrame02Png from 'asset:贴图/界面/结构罗盘/帧-02';
import compassFrame03Png from 'asset:贴图/界面/结构罗盘/帧-03';
import compassFrame04Png from 'asset:贴图/界面/结构罗盘/帧-04';
import compassFrame05Png from 'asset:贴图/界面/结构罗盘/帧-05';
import compassFrame06Png from 'asset:贴图/界面/结构罗盘/帧-06';
import compassFrame07Png from 'asset:贴图/界面/结构罗盘/帧-07';
const frameTable = frameTableAsset as unknown as { 帧数: number; 帧: string[] };

const ctx = assetDir({ './帧-00.png': compassFrame00Png, './帧-01.png': compassFrame01Png, './帧-02.png': compassFrame02Png, './帧-03.png': compassFrame03Png, './帧-04.png': compassFrame04Png, './帧-05.png': compassFrame05Png, './帧-06.png': compassFrame06Png, './帧-07.png': compassFrame07Png }) as unknown as { keys(): string[]; (k: string): string | { default: string } };
const pngUrls: Record<string, string> = {};
for (const k of ctx.keys()) {
  const pngModule = ctx(k);
  pngUrls[k.replace(/^\.\//, '')] = typeof pngModule === 'string' ? pngModule : pngModule.default;
}
// 帧：界面开着的第几帧（0 = 刚打开）；不在 0～帧数-1 里就不画
export const CompassUi: React.FC<{ frame: number }> = ({ frame: frame }) => {
  const i = Math.floor(frame);
  if (i < 0 || i >= frameTable.帧.length) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <Img src={pngUrls[frameTable.帧[i]]} style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
    </AbsoluteFill>
  );
};
