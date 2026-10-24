// 第 6、7 句坐在坑沿的她：魔法酒狐（新动作版）坐着，帽子当伞那一段左手拿着单拿出来的魔女帽（酒狐件.tsx）。
// 帽子走哪条路由 段/2-雷雨/编排.ts 的 帽态 给；'头上' 按她这一帧的骨骼算（戴着时 witchcap 的位置、头转的角度），左胳膊按手该在帽檐哪一点逆解（库/角色/手臂逆解.ts）。
// 每帧从初值单独解（Remotion 各帧分开渲），初值随帽子走的进度在 参.臂初值 两头之间插，结果才连续。
import type React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { magicalWineFoxSitBones } from '@库/角色/魔法酒狐.tsx';
import { MagicalWineFoxEx, magicalWineFoxBoneAt, magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { solveReach } from '@库/角色/手臂逆解.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { 学徒法术书 } from '../../物品/学徒法术书.tsx';
import type { 帽位, 帽态, 她态 } from '../../段/2-雷雨/编排.ts';
import * as 参 from './参数.ts';
import { 帽上点, 魔女帽, type 帽摆 } from './酒狐件.tsx';

type 骨表 = Record<string, BonePose>;
const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插数组 = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => 插(v, b[i]!, t));

/** 左胳膊四个量 → 骨骼表里的两条（LeftArm 三个转角、LeftForeArm 只弯一个） */
const 臂骨 = (x: readonly number[]): 骨表 => ({ LeftArm: { rot: [x[0]!, x[1]!, x[2]!] }, LeftForeArm: { rot: [x[3]!, 0, 0] } });
const 放着 = magicalWineFoxSitBones;
const 放着臂 = (): 骨表 => ({ LeftArm: 放着.LeftArm!, LeftForeArm: 放着.LeftForeArm! });
/** 两张胳膊表按转角插 */
const 插臂 = (a: 骨表, b: 骨表, t: number): 骨表 => ({
  LeftArm: { rot: 插数组(a.LeftArm!.rot!, b.LeftArm!.rot!, t) as V3 },
  LeftForeArm: { rot: 插数组(a.LeftForeArm!.rot!, b.LeftForeArm!.rot!, t) as V3 },
});

/** 左手（LeftHand 骨骼 pivot）够到 目标 的胳膊 */
const 够 = (p: 魔法酒狐新动作Props, 表: 骨表, 目标: V3, 初值: readonly number[]): 骨表 => {
  const x = solveReach(
    (x) => magicalWineFoxBoneAt(p.pose, { ...表, ...臂骨(x) }, 'LeftHand'),
    [...初值],
    目标,
    [0.0008, 0.0008, 0.0008, 0.0008],
    [[-200, 60], [-90, 90], [-160, 40], [-150, 0]],
  );
  return 臂骨(x);
};

export const 坑沿的她: React.FC<{ 态: 她态 }> = ({ 态 }) => {
  const 帽: 帽态 = 态.帽;
  const 戴着 = 帽.种 !== '拿着';
  const p: 魔法酒狐新动作Props = {
    pose: { ...standPose(态.loc), yaw: 态.yaw },
    姿势: '坐',
    表情: 态.表情,
    看: 态.看,
    秒: 态.秒,
    眨眼: 'auto',
    帽子: 戴着,
    ...(态.拿书 ? { 左手: { 物品: <学徒法术书 /> } } : {}),
  };
  // 戴着帽子时的骨骼表：'头上' 的帽摆从这里取（不管这一帧戴没戴，都按戴着算 witchcap 在哪）
  const 戴表 = magicalWineFoxExBones({ ...p, 帽子: true });
  const 头上: 帽摆 = { 位: magicalWineFoxBoneAt(p.pose, 戴表, 'witchcap'), 朝向: 态.yaw + 态.看[1], 歪: 0, 仰: 态.看[0] };
  const 拿起: 帽摆 = { 位: [头上.位[0] + 参.拿起挪[0], 头上.位[1] + 参.拿起挪[1], 头上.位[2] + 参.拿起挪[2]], 朝向: 态.yaw, 歪: 0, 仰: 0 };
  const 解位 = (w: 帽位): 帽摆 => (w === '头上' ? 头上 : w === '拿起' ? 拿起 : w);
  const 表 = magicalWineFoxExBones(p);

  let 臂: 骨表 = {};
  let 手里: 帽摆 | null = null;
  if (帽.种 === '伸手' || 帽.种 === '放手') {
    const 到 = 够(p, 表, 帽上点(头上, 参.握点.东沿), 参.臂初值.头上);
    臂 = 插臂(放着臂(), 到, 帽.种 === '伸手' ? 帽.t : 1 - 帽.t);
  } else if (帽.种 === '拿着') {
    const [a, b] = [解位(帽.从), 解位(帽.到)];
    const t = 帽.t;
    手里 = {
      位: [插(a.位[0], b.位[0], t), 插(a.位[1], b.位[1], t), 插(a.位[2], b.位[2], t) + 帽.拱 * Math.sin(Math.PI * t)],
      朝向: 插(a.朝向, b.朝向, t),
      歪: 插(a.歪 ?? 0, b.歪 ?? 0, t),
      仰: 插(a.仰 ?? 0, b.仰 ?? 0, t),
    };
    // 初值：从她头上那头往你头顶那头挪了多少
    const 往伞 = 帽.到 !== '头上' && 帽.到 !== '拿起' ? t : 帽.从 !== '头上' && 帽.从 !== '拿起' ? 1 - t : 0;
    const 握 = 插数组(帽.握从, 帽.握到, t);
    臂 = 够(p, 表, 帽上点(手里, 握), 插数组(参.臂初值.头上, 参.臂初值.伞, 往伞));
  }

  return (
    <贴图像素对齐 锚={态.loc}>
      <MagicalWineFoxEx {...p} 骨骼={臂} />
      {手里 && <魔女帽 {...手里} />}
    </贴图像素对齐>
  );
};
