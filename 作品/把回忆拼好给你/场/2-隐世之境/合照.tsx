// 15 尾（52.94–55.08）的画法，按歌曲帧画，一帧一个整页（1280×720）：
// - 尾笑（52.94）：2-重逢 推脸那个机位不动（重逢.tsx 的 重逢画面），她换成笑（同第 8 句的得意：闭眼、歪头），气泡换成「(✿◠‿◠)」；
// - 靠肩（53.80）：切回侧面——正交侧剖面（同门这个机位那套画法），朝东看主厅东墙那扇窗，你和她面朝镜头并排站，她歪头靠在你肩上；
// - 合照咔哒（54.65）起整屏白，白到段尾（片尾从白里接 PCL）。
// 截下来的新合照就是咔哒那一帧的靠肩（合照照片：藏起聊天、不带歌词、不闪白），片尾拼回的 PCL 新图标从它取；合照拍立得 是它套成第 11 句那样的拍立得（片里没露）。
// 叠层（聊天栏、歌词）由段传进来，放在整片后期里面；白盖在最上面。参数见 合照参数.ts，哪一帧是哪一镜、靠肩的机位见 合照动作.ts。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 做机位相机, type 正交机位参数 } from '@engine/三渲二/机位.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 女仆气泡, 女仆气泡锚高 } from '@库/界面/女仆气泡.tsx';
import { 投影到页面, Z朝上转three } from '@库/界面/投影.ts';
import { fps, 画幅, 正片事件 } from '../../分镜.ts';
import { 画布调子, 描边 as 描边默认 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 拍立得 } from '../../特效/拍立得.tsx';
import { 她看你, 重逢发光区, 隐世之境重逢布景 } from './布景.tsx';
import { 她 } from './参数.ts';
import { 对视门光, 门光色调, 背景褪色参数 } from './对视参数.ts';
import { 拿着花的她, 空手拿 } from './对视.tsx';
import { 合照镜头, 靠肩机位 } from './合照动作.ts';
import { 合照站位, 合照朝向, 合照镜, 史蒂夫倍数, 你的头, 第11句拍立得样式, 笑, 靠肩, 靠肩气泡, 闪白色 } from './合照参数.ts';
import { 重逢画面, type 换她 } from './重逢.tsx';
import { 不褪色, 背景褪色 } from './褪色.tsx';

const 调子 = '归隐之地' as const;
const 事 = 正片事件;

/** 骨骼的转角上再加一个滚转（度） */
const 加滚 = (b: BonePose | undefined, 滚: number): BonePose => {
  const [x = 0, y = 0, z = 0] = b?.rot ?? [];
  return { ...b, rot: [x, y, z + 滚] };
};

// ---------- 尾笑 ----------

/** 她的笑：同 重逢.tsx 回过头以后的她（站、侧身、头看着你、举着月铃兰），表情换成微笑、闭眼，头再往你那边歪 笑.歪、抬 笑.抬。
 *  参 换掉 笑 里的几项（核对比较用） */
export const 笑的她 =
  (参: Partial<typeof 笑> = {}): 换她 =>
  (秒, 眼) => {
    const q = { ...笑, ...参 };
    const pose: FigurePose = { ...standPose(她.脚), yaw: 她.身子朝向 };
    const [俯仰, 左右] = 她看你(眼, pose);
    const p: 魔法酒狐新动作Props = { pose, 姿势: '站', 表情: q.表情, 看: [俯仰 + q.抬, 左右], 眨眼: q.眨眼, 秒, 右手: 空手拿 };
    return <拿着花的她 p={p} 叠骨骼={{ Head: 加滚(magicalWineFoxExBones(p).Head, q.歪) }} />;
  };
const 片里笑的她 = 笑的她();

/** 尾笑这一镜的一整帧：2-重逢 推脸的机位（重逢机位 过了段尾就停在推脸），她换成笑、气泡换成「(✿◠‿◠)」 */
export const 尾笑画面: React.FC<{ 帧: number; 叠层?: React.ReactNode; 后期?: boolean; 笑参?: Partial<typeof 笑> }> = ({ 帧, 叠层, 后期, 笑参 }) => (
  <重逢画面 帧={帧} 她={笑参 ? 笑的她(笑参) : 片里笑的她} 气泡字={笑.气泡字} 叠层={叠层} 后期={后期} />
);

// ---------- 靠肩 ----------

/** 镜头那一边很远的一点：正交镜头朝东，花的正面朝西 */
const 镜头方向: V3 = [合照镜.看[0] - 100, 合照镜.看[1], 合照镜.看[2]];

const 靠肩的她: React.FC<{ 秒: number }> = ({ 秒 }) => {
  const pose: FigurePose = { ...standPose(合照站位.她), yaw: 合照朝向 };
  const p: 魔法酒狐新动作Props = { pose, 姿势: '站', 表情: 靠肩.表情, 看: 靠肩.看, 眨眼: 靠肩.眨眼, 秒, 右手: 空手拿 };
  const 表 = magicalWineFoxExBones(p);
  return <拿着花的她 p={p} 举={靠肩.举花} 叠骨骼={{ Head: 加滚(表.Head, 靠肩.歪), UpBody: 加滚(表.UpBody, 靠肩.上身歪) }} 眼={镜头方向} />;
};

const 靠肩的你: React.FC = () => {
  // 不传 sec、两臂外摆清零（同 2-收集快乐：原版站着两臂的轻晃会让胳膊斜着）
  const pose = { ...stevePose(合照站位.你, 合照朝向, { headYaw: 你的头.偏, headPitch: 你的头.俯, scale: 史蒂夫倍数 }), armRRoll: 0, armLRoll: 0 };
  return (
    <贴图像素对齐 锚={pose.loc as V3}>
      <Steve pose={pose} />
    </贴图像素对齐>
  );
};

const 靠肩场景: React.FC<{ 秒: number; 描边: boolean; 褪色: boolean }> = ({ 秒, 描边: 描, 褪色 }) => {
  const 人 = (
    <>
      <描边 开={描}>
        <靠肩的你 />
      </描边>
      <描边 开={描}>
        <贴图像素对齐 锚={合照站位.她}>
          <靠肩的她 秒={秒} />
        </贴图像素对齐>
      </描边>
    </>
  );
  const 布景 = (
    <隐世之境重逢布景 开={1} 灯光={false} 门光参数={对视门光} 秒={秒}>
      {褪色 ? <不褪色>{人}</不褪色> : 人}
    </隐世之境重逢布景>
  );
  return 褪色 ? <背景褪色 参数={背景褪色参数}>{布景}</背景褪色> : 布景;
};

/** 她头顶的气泡（正交：倍数 = N，锚点照原版脚底 + 女仆气泡锚高 投到画面上） */
const 靠肩气泡层: React.FC = () => {
  const cam = 做机位相机(靠肩机位, 画幅.宽, 画幅.高, canvasDpr(1));
  const p = 投影到页面(cam, Z朝上转three([合照站位.她[0], 合照站位.她[1], 合照站位.她[2] + 女仆气泡锚高()]), 画幅.宽, 画幅.高);
  return <女仆气泡 锚={{ x: p.x, y: p.y }} 缩放={合照镜.N} 锚对齐={合照镜.N} 文字={笑.气泡字} 字体={像素字} />;
};

export type 靠肩画面属性 = {
  /** 歌曲帧（她的呼吸、颗粒的种子） */
  帧: number;
  /** 叠在 3D 和气泡上面、整片后期里面的 2D（歌词） */
  叠层?: React.ReactNode;
  /** 她头顶的「(✿◠‿◠)」，不给 = 合照参数 的 靠肩气泡 */
  气泡?: boolean;
  /** 背景褪色（同 2-重逢 那一镜），核对比较用；默认不褪 */
  褪色?: boolean;
  /** 换一个机位（核对里看大环境用），不给 = 靠肩机位 */
  机位?: 正交机位参数;
  描边?: boolean;
  后期?: boolean;
};

/** 靠肩这一镜的一整帧（1280×720 页面），自己铺满 */
export const 靠肩画面: React.FC<靠肩画面属性> = ({ 帧, 叠层, 气泡 = 靠肩气泡, 褪色 = false, 机位 = 靠肩机位, 描边: 描 = 描边默认.开, 后期 = true }) => {
  const t = 色板[调子];
  return (
    <整片后期 调色={后期 ? t.调色 : null} 种子={帧}>
      <三渲二画布 宽={画幅.宽} 高={画幅.高} 机位={机位} {...画布调子(调子)} 色调={门光色调} 发光区={重逢发光区}>
        <靠肩场景 秒={帧 / fps} 描边={描} 褪色={褪色} />
      </三渲二画布>
      {气泡 && <靠肩气泡层 />}
      {叠层}
    </整片后期>
  );
};

// ---------- 新合照 ----------

/** 截下来的新合照（干净帧）：咔哒那一帧（分镜 照片-合照）的靠肩，不带聊天、歌词，不闪白；气泡照片里的样子同片里。
 *  片尾 PCL 的新图标取这一帧画面正中的正方形（界面/实例图标.ts 的 取图标），两个人都在正方形里 */
export const 合照照片: React.FC<{ 后期?: boolean; 气泡?: boolean }> = ({ 后期 = true, 气泡 }) => (
  <靠肩画面 帧={事['照片-合照'].帧} 后期={后期} 气泡={气泡} />
);

/** 拍立得缩小、转斜、字淡入都走完的那一帧（相对定格帧） */
const 拍立得停稳帧 = Math.max(第11句拍立得样式.闪白帧, 第11句拍立得样式.缩小帧, 第11句拍立得样式.字延迟帧 + 第11句拍立得样式.字淡入帧);

/** 新合照套成第 11 句那样的拍立得：特效/拍立得.tsx 停稳以后的样子（斜放、三边窄白边下边宽、投影、纸纹底），样式 = 合照参数 的 第11句拍立得样式，整页。
 *  片里没露（见 合照参数 的 闪白色）；核对、以后要露这张照片的地方用。字：下白边那一行，不给不写。
 *  定格帧取「这一帧往前 停稳帧」，拍立得 每一帧都画成停稳的样子；坑：不能用 remotion 的 Freeze 把它冻在停稳帧上，
 *  里面的 ThreeCanvas 在 renderStill 单出这一帧时一直等不到放行（anim still 超时），renderMedia 整段渲却没事 */
export const 合照拍立得: React.FC<{ 后期?: boolean; 字?: string }> = ({ 后期 = true, 字 }) => {
  const f = useCurrentFrame();
  return (
    <拍立得 定格帧={f - 拍立得停稳帧} 样式={第11句拍立得样式} 字={字}>
      {() => <合照照片 后期={后期} />}
    </拍立得>
  );
};

// ---------- 整段 ----------

/** 15 尾一整帧：叠层 按镜头给（笑那一镜还有聊天栏、靠肩那一镜没有），放在整片后期里面；咔哒起整屏白 */
export const 合照画面: React.FC<{ 帧: number; 叠层?: (镜: '笑' | '靠肩') => React.ReactNode }> = ({ 帧, 叠层 }) => {
  const 镜 = 合照镜头(帧);
  if (镜 === '白') return <div style={{ position: 'absolute', inset: 0, background: 闪白色 }} />;
  return 镜 === '笑' ? <尾笑画面 帧={帧} 叠层={叠层?.('笑')} /> : <靠肩画面 帧={帧} 叠层={叠层?.('靠肩')} />;
};
