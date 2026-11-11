// 史蒂夫的肘和膝：关节在哪、弯了以后脚底在哪、髋该多高。纯计算；画在 角色/史蒂夫装备.tsx（弯折的几何在 角色/弯折.ts）。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版。所以这套不进 库/（库/角色/史蒂夫.tsx 是原版玩家模型，别的作品在用）。
// 角度用 StevePose（库/角色/骨架.tsx 的 FigurePose）里已有的四个字段，单位度，正负照那边：
//   elbowR / elbowL：前臂相对上臂往前折（正）；kneeR / kneeL：小腿相对大腿往后折（正）。都是 0 时和原版一模一样。
// 原版那套髋高（库里的 hipHeight）不认膝；这里按两节腿算，接在 steveRootMatrix 外面补上。
import * as THREE from 'three';
import { rad } from '@engine/core/数学.ts';
import { type StevePose, STEVE, steveRootMatrix } from '@库/角色/史蒂夫.tsx';

/** 关节在部件里的位置（模型像素，y 朝下、z 朝后）：切 = 关节的 y，铰z = 铰链的 z。手臂方盒 y −2～10、腿 0～12，都从正中折。
 *  肘的铰链从中线往折的内侧（前）偏 1 像素，内侧少吃进去一点；膝的铰链在中线上：往后偏的话小腿折起来反而把人垫高，蹲不下去。Agent 取的 */
export const 关节 = {
  肘: { 切: 4, 铰z: -1 },
  膝: { 切: 6, 铰z: 0 },
} as const;

const 腿长 = 12;
/** 脚掌前后各半个宽（像素） */
const 半脚 = 2;
/** 没有踝，小腿斜着时脚尖（或脚跟）比脚底中心低；按它着地人会被垫高、蹲不深，按脚底中心着地脚尖又全吃进地里：各让一半 */
const 脚尖着地 = 0.5;

/** 膝弯 膝度 时脚底中心在大腿坐标里的位置（像素）：沿 = 顺着大腿往下，后 = 垂直大腿往后 */
export const 脚底 = (膝度: number) => {
  const { 切, 铰z } = 关节.膝;
  const [c, s] = [Math.cos(rad(膝度)), Math.sin(rad(膝度))];
  return { 沿: 切 + (腿长 - 切) * c + 铰z * s, 后: 铰z + (腿长 - 切) * s - 铰z * c };
};

/** 大腿和竖直线的夹角是 腿度（往前为正，已经算上身子前倾）、膝弯 膝度 时，脚底最低处在髋下面多少像素、脚底中心在髋前面多少像素。
 *  最低处：脚底中心再加一半脚尖多出来的（见 脚尖着地）；膝是 0 时不算这一项（和库里只看脚底中心一样），20 度以内渐入。不超过腿长 */
export const 腿伸 = (腿度: number, 膝度: number) => {
  const { 沿, 后 } = 脚底(膝度);
  const [c, s] = [Math.cos(rad(腿度)), Math.sin(rad(腿度))];
  const 渐 = Math.min(1, Math.abs(膝度) / 20);
  const 脚尖 = 半脚 * 脚尖着地 * Math.abs(Math.sin(rad(腿度 - 膝度))) * 渐 * 渐 * (3 - 2 * 渐);
  return { 下: Math.min(腿长, 沿 * c + 后 * s + 脚尖), 前: 沿 * s - 后 * c };
};

/** 膝弯 膝度 时，大腿往前抬多少度（相对竖直线）脚底中心正好在髋的正下方：下蹲、落地缓冲用 */
export const 蹲腿角 = (膝度: number) => {
  const { 沿, 后 } = 脚底(膝度);
  return (Math.atan2(后, 沿) * 180) / Math.PI;
};

/** 髋离地高度（像素）：同库里的 hipHeight（哪条腿伸得低以它着地，ground 调贴地的程度），只是腿按两节算 */
export const 髋高 = (pose: StevePose) => {
  const 伸 = (腿: number, 膝: number | undefined) => 腿伸(腿 + pose.pitch, 膝 ?? 0).下;
  const 着地 = Math.max(3, 伸(pose.legR, pose.kneeR), 伸(pose.legL, pose.kneeL));
  return 腿长 + (pose.ground ?? 1) * (着地 - 腿长);
};

/** 同 steveRootMatrix（落脚点、转身、缩放、以髋为轴前倾），髋高换成认膝的 */
export const 关节根矩阵 = (pose: StevePose) => {
  const 每像素 = (pose.scale ?? STEVE.scale) / 16;
  return new THREE.Matrix4().makeTranslation(0, 0, (髋高(pose) - 腿长) * pose.squash * 每像素).multiply(steveRootMatrix({ ...pose, ground: 0 }));
};

/** 挂在肢体上的一块盔甲网格（顶点表，每顶点 8 个数）怎么跟关节：'弯' 在关节处裁开跟着折；'上' / '下' 整块跟上半节、下半节。
 *  斜着的块（肩甲、腿侧的甲片）和只探过关节不到 3 像素的（上臂的臂环）不折，看中心在关节哪边 */
export const 网格分节 = (顶点: readonly number[], 切: number): '弯' | '上' | '下' => {
  let [低, 高, 正] = [Infinity, -Infinity, true];
  for (let i = 0; i < 顶点.length; i += 8) {
    低 = Math.min(低, 顶点[i + 1]!);
    高 = Math.max(高, 顶点[i + 1]!);
    if (Math.max(Math.abs(顶点[i + 5]!), Math.abs(顶点[i + 6]!), Math.abs(顶点[i + 7]!)) < 0.999) 正 = false;
  }
  if (正 && 切 - 低 >= 3 && 高 - 切 >= 3) return '弯';
  return (低 + 高) / 2 <= 切 ? '上' : '下';
};
