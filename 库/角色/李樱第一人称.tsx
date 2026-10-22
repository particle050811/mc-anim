// 第一人称空手时露出来的李樱自己的右臂，放进 第一人称.tsx 的 FirstPersonHand 的 arm 插槽。
// 不改 李樱.tsx（它一改，import 它的段全部过期）：手画布里放一整个 <LiYing/>，摆成右肩关节正好落在原版右臂的转轴上，
// 再用画布级裁剪面（gl.clippingPlanes）只留肩关节往下的右臂，肩头切开的口用一块袖子颜色的面封上。
// 姿势让右臂往外平举 90°：垂着时整条手臂内侧都贴着身子，平举后只在肩头相挨，垂直手臂一刀切在肩关节上，身子、头、腿就全切掉了。
// 切口平时在画面下沿外头；原版挥手刚起、手又举到位的那一两刻肩头会进画，所以要封口。
// 李樱的手臂 4×4 像素，和史蒂夫宽手臂一样粗；原版第一人称按 1/16 格一像素画手臂（不乘 0.9375），这里也一样，比第三人称里的她略大。
import { useThree } from '@react-three/fiber';
import React, { useContext, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { ArmFrame } from './第一人称.tsx';
import { LIYING, LiYing } from './李樱.tsx';
import { type FigurePose, handMatrix, standPose } from './骨架.tsx';

/** 李樱.tsx 里 Figure 的 height（格） */
const HEIGHT = 1.875;
const POSE: FigurePose = { ...standPose([0, 0, 0]), armRRoll: -90 };

// 骨架的右肩关节坐标系 q（像素：手臂沿 −Z 下垂、面朝 +Y、右手在 +X，见 骨架.tsx）→ 李樱模型根：握持点矩阵往回 9 像素（肘角 0）
const SHOULDER = handMatrix(POSE, HEIGHT, 'R').multiply(new THREE.Matrix4().makeTranslation(0, 0, 9));
// q → 原版右臂部件坐标 p：p = (−(q.x + 1), −q.z, −q.y)。原版实体模型 y 朝下、面朝 −Z、右手在 −X；
// 原点差 1 像素：骨架的肩关节在手臂正中，原版右臂转轴在 x = −5、手臂占 −8..−4，离身子中线近 1 像素
const Q_TO_P = new THREE.Matrix4().set(-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
// 李樱模型根 → p
const PLACE = Q_TO_P.clone().multiply(SHOULDER.clone().invert());

/** 只留 q.z ≤ CUT 的部分（肩关节往下）。平举后身子最外到 x = 4.25（胸带）、头发到 5.25，都在肩关节 x = 6 以内 */
const CUT = 0;

// 同 李樱.tsx 的 liftForNeutral（没导出）：NeutralToneMapping 会从暗色里减掉一份底色，先加回去，封口才和袖子一个颜色
const liftForNeutral = (hex: string) => {
  const color = new THREE.Color(hex);
  const x = Math.min(color.r, color.g, color.b);
  const lift = (x < 0.04 ? 0.4 * Math.sqrt(x) : x + 0.04) - x;
  return new THREE.Color(color.r + lift, color.g + lift, color.b + lift);
};
// 封口用袖子顶面的颜色（体素 armR 顶面大多是夹克色），粗糙度同 李樱.tsx 的 cloth
const CAP_COLOR = liftForNeutral(LIYING.jacket);

/** clip：关掉裁剪看整个人摆在哪（只给核对用） */
export const LiYingFirstPersonArm: React.FC<{ clip?: boolean }> = ({ clip = true }) => {
  const frame = useContext(ArmFrame);
  const { gl } = useThree();
  // 裁剪面在画布坐标里（世界坐标就是视图坐标），每帧照手臂的位置重算
  gl.clippingPlanes = clip ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), CUT).applyMatrix4(frame.clone().multiply(Q_TO_P))] : [];
  useLayoutEffect(
    () => () => {
      gl.clippingPlanes = [];
    },
    [gl],
  );
  return (
    <>
      <group matrix={PLACE} matrixAutoUpdate={false}>
        <LiYing pose={POSE} />
      </group>
      <group matrix={Q_TO_P} matrixAutoUpdate={false}>
        {/* 封口：armR 截面 4×4，朝肩头那边，往下让一点免得被裁剪面切掉 */}
        <mesh position={[0, 0, CUT - 0.01]}>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial color={CAP_COLOR} roughness={0.9} />
        </mesh>
      </group>
    </>
  );
};
