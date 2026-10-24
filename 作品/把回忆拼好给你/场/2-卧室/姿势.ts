// 第 12 句她的两个姿势：坐在床沿（TLM 的 chair）、弯腰抚平被子（演绎）。给 MagicalWineFoxEx 的 骨骼（按骨骼整条替换），底子用 静站。纯模块。
import type { BonePose } from '@engine/model/基岩模型.tsx';

type 骨表 = Record<string, BonePose>;

/**
 * 坐床沿：照抄车万女仆 1.5.3 魔法酒狐的 chair 动画（winefox_magical.main.animation.json，女仆坐椅子、坐在别的实体上时放的那一段）：
 * 整个人降 16 像素、大腿往前抬平（−82.5°）、小腿垂下（82.5°），两手搭在腿上，裙摆前片掀到大腿上、后片和侧片摊在坐面上。
 * 游戏里坐的是椅子；床沿坐是演绎（原版床不能坐）。动画里尾巴、上身、头随时间轻晃（sin，几度），小腿 ±2° 晃脚：三稿「一动不动」，这里取 anim_time = 0 那一刻定住
 *  （尾巴各节 sin(相位)×10、小腿 82.5 + sin(∓90°)×2 都按 0 秒算）。
 * 降 16 像素以后髋（LeftLeg 的 pivot y 16.89）离脚底 0.89 像素：把她的脚底原点放在坐面上，大腿底面正好压在坐面上
 */
const 尾 = (相位: number) => Math.sin((相位 * Math.PI) / 180) * 10;
export const 坐床沿骨骼: 骨表 = {
  Root: { pos: [0, -16, 0] },
  UpBody: { rot: [0, 0, 0] },
  Tail: { rot: [0, 尾(-30), 0] },
  Tail2: { rot: [0, 尾(-90), 0] },
  Tail3: { rot: [0, 尾(-120), -尾(-120)] },
  Tail4: { rot: [0, 尾(-160), 0] },
  Tail5: { rot: [0, 尾(-180), 0] },
  Tail6: { rot: [0, 尾(-180), 0] },
  Tail7: { rot: [0, 尾(-180), 0] },
  UpperBody: { rot: [0, 0, 2] },
  LeftArm: { rot: [-7.5, 0, 0] },
  LeftForeArm: { rot: [-64.82222, 20.48789, 23.22512] },
  RightArm: { rot: [-7.5, 0, 0] },
  RightForeArm: { rot: [-64.82222, -20.48789, -23.22512] },
  LF: { rot: [-62.5, 0, 0] },
  LF2: { scale: [1, 0.7, 1] },
  LF3: { rot: [67.5, 0, 0], pos: [0, 0.4, -0.5], scale: [1, 1.9, 1] },
  LB: { rot: [-0.25998, 8.18467, 21.4824], pos: [-0.4, 0.4, -2.1], scale: [1, 0.35, 1.07] },
  LM2: { rot: [-77.55592, 9.00787, -11.1043], scale: [1, 0.87, 1.3] },
  RM: { rot: [0, 0, 0] },
  RM2: { rot: [-77.55592, -9.00787, 11.1043], scale: [1, 0.87, 1.3] },
  RB: { rot: [-0.25998, -8.18467, -21.4824], pos: [0.4, 0.4, -2.1], scale: [1, 0.35, 1.07] },
  RB2: { scale: 1 },
  RF: { rot: [-62.5, 0, 0] },
  RF2: { scale: [1, 0.7, 1] },
  RF3: { rot: [67.5, 0, 0], pos: [0, 0.4, -0.5], scale: [1, 1.9, 1] },
  BR2: { rot: [-87.5, 0, 0], scale: [1, 1.1, 1] },
  BL2: { rot: [-87.5, 0, 0], scale: [1, 1.1, 1] },
  BM2: { rot: [-87.5, 0, 0], scale: [1, 1.1, 1] },
  FL: { rot: [-52.5, 0, 0] },
  FL1: { rot: [-10, 0, 0], scale: [1, 0.7, 1] },
  FL2: { rot: [60, 0, 0], scale: [1, 1.9, 1] },
  FR: { rot: [-52.5, 0, 0] },
  FR1: { rot: [-10, 0, 0], scale: [1, 0.7, 1] },
  FR2: { rot: [60, 0, 0], scale: [1, 1.9, 1] },
  FM: { rot: [-57.5, 0, 0] },
  FM1: { rot: [0, 0, 0], scale: [1, 0.7, 1] },
  FM2: { rot: [55, 0, 0], scale: [1, 1.9, 1] },
  FFM: { rot: [-55, 0, 0] },
  FFM2_1: { rot: [-2.5, 0, 0], scale: [1, 0.6, 1] },
  FFM1_1: { rot: [-2.5, 0, 0], scale: [1, 0.6, 1] },
  FFM3_1: { rot: [-2.5, 0, 0], scale: [1, 0.6, 1] },
  RightLeg: { rot: [-82.5, 0, 0] },
  RightLowerLeg: { rot: [82.5 + Math.sin((-90 * Math.PI) / 180) * 2, 0, 0] },
  LeftLeg: { rot: [-82.5, 0, 0] },
  LeftLowerLeg: { rot: [82.5 + Math.sin((90 * Math.PI) / 180) * 2, 0, 0] },
};

// ---------- 抚平被子 ----------
// 魔法酒狐模型（模型/角色/魔法酒狐，TLM 1.5.3 winefox_magical）的几根骨骼 pivot 高（模型像素，脚底 0）：腰 UpBody、胸 UpperBody、右肩 RightArm、右肘 RightForeArm、右手 RightHand。
// 尾巴（MTail）、裙子（clothe）挂在 UpBody 下面，头、两臂挂在 UpperBody 下面
const 腰 = 17.566, 胸 = 21.404, 肩 = 26.026, 肘 = 21.065, 手 = 14.484;
const 上臂 = 肩 - 肘, 前臂 = 肘 - 手;
/** 模型一像素多少格（TLM render_entity_scale 0.65） */
const 像素 = 0.65 / 16;
/** 手那块方的半厚（像素）：手心贴在被面上，手的 pivot 比被面高这么多 */
const 手半厚 = 0.45;
const 度 = 180 / Math.PI;
const sin = (d: number) => Math.sin(d / 度), cos = (d: number) => Math.cos(d / 度);

/**
 * 抚平被子（演绎，Agent 暂定）：站在床边、朝床弯腰，右手手心贴着被面来回抹，左手垂在身侧。侧视里是一个平面上的动作，按两节胳膊在矢状面里反解：
 * 给手要落在身子前面多远、多高（格，相对她的脚底），弯腰 腰弯 + 胸弯 度（腰弯在 UpBody、胸弯在 UpperBody；裙子、尾巴跟着腰转，反着转回去免得裙摆翻起来），
 * 解出右上臂、右前臂各转多少（肘往后弯，前臂往前）。头抬 = 给 看 的俯仰（头相对上身抬多少）：后脑勺的长发（LongHair，挂在 Head 下）按头实际低了多少转回去，垂下来；
 * 不转的话头发跟着头翘起来，和上身连成一长条斜着往上，侧视里像仰着头（三稿静帧）。转角照基岩约定：rot.x 正 = 低头、手脚往后摆，和骨骼自带的转角相加
 */
export const 抚平骨骼 = (手前: number, 手高: number, 腰弯: number, 胸弯: number, 头抬: number, 尾压 = 10): 骨表 => {
  const 弯 = 腰弯 + 胸弯;
  // 右肩在哪（前、上，模型像素）
  const 肩前 = (胸 - 腰) * sin(腰弯) + (肩 - 胸) * sin(弯);
  const 肩高 = 腰 + (胸 - 腰) * cos(腰弯) + (肩 - 胸) * cos(弯);
  const 前 = 手前 / 像素 - 肩前, 下 = 肩高 - (手高 / 像素 + 手半厚);
  const d = Math.min(上臂 + 前臂 - 0.01, Math.max(Math.abs(上臂 - 前臂) + 0.01, Math.hypot(前, 下)));
  // ψ：肩到手那条线离竖直往下多少度（往前为正）；γ：上臂比这条线往后让多少度（余弦定理），肘就往后弯
  const ψ = Math.atan2(前, 下) * 度;
  const γ = Math.acos((上臂 ** 2 + d ** 2 - 前臂 ** 2) / (2 * 上臂 * d)) * 度;
  const 上臂角 = ψ - γ;
  const 肘前 = 上臂 * sin(上臂角), 肘下 = 上臂 * cos(上臂角);
  const 前臂角 = Math.atan2((前 / Math.hypot(前, 下)) * d - 肘前, (下 / Math.hypot(前, 下)) * d - 肘下) * 度;
  return {
    UpBody: { rot: [腰弯, 0, 0] },
    UpperBody: { rot: [胸弯, 0, 0] },
    clothe: { rot: [-腰弯, 0, 0] },
    // 尾巴跟着腰抬起来、和弯下去的上身在侧视里摆成一个 V（二稿静帧），转回去再往下压 尾压 度，垂在腿后（横着伸出去读成翅膀，核查 10-24）
    Tail: { rot: [-腰弯 - 尾压, 0, 0] },
    LongHair: { rot: [-(弯 - 头抬), 0, 0] },
    // 两臂骨骼自带往外撇 18°（z），抹被子时收回来，手在身前
    RightArm: { rot: [-弯 - 上臂角, 0, -14] },
    RightForeArm: { rot: [上臂角 - 前臂角, 0, 0] },
    LeftArm: { rot: [-弯 + 6, 0, 10] },
    LeftForeArm: { rot: [-18, 0, 0] },
  };
};

/** 反过来：按 抚平骨骼 给的转角（腰、胸、右上臂、右前臂的 rot.x）正着算一遍，右手 pivot 在她脚底前面多远、多高（格）。给测试核对反解 */
export const 抚平手位 = (骨: 骨表): [number, number] => {
  const x = (n: string) => (骨[n]?.rot as number[] | undefined)?.[0] ?? 0;
  const 腰弯 = x('UpBody'), 弯 = 腰弯 + x('UpperBody');
  const 上臂角 = -弯 - x('RightArm'), 前臂角 = 上臂角 - x('RightForeArm');
  const 前 = (胸 - 腰) * sin(腰弯) + (肩 - 胸) * sin(弯) + 上臂 * sin(上臂角) + 前臂 * sin(前臂角);
  const 高 = 腰 + (胸 - 腰) * cos(腰弯) + (肩 - 胸) * cos(弯) - 上臂 * cos(上臂角) - 前臂 * cos(前臂角);
  return [前 * 像素, (高 - 手半厚) * 像素];
};
