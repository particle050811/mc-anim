// 第 5 句她的几个姿势：伏（扑之前）、蹬（起跳前压低）、扑（半空）、抱（落地抱住蛋）、趴（扑空）、撑（撑起上身抬头看你）。纯数据，编排.ts 按帧挑、插值。
// 全是 TLM 里没有的动作，Agent 照模型骨骼演绎（用户没看过）。骨骼名、转角约定同 库/角色/魔法酒狐新动作.ts：
// UpBody x 正 = 上身前倾、负 = 往后仰；手臂 x 负 = 往前抬（−170 举过头顶）；腿 x 负 = 大腿往前抬、正 = 往后摆，小腿 x 正 = 膝盖往后折；
// 尾巴 Tail y = 左右甩；x 是试出来的：趴平时 −80 竖在背上、−100～−110 顺着腿放平、−140 以下钻进地里，正的往背上压成一大团。
// 骨骼表按骨骼整条替换，给的每条都要写全 rot / pos / scale。
// 扑和趴整个人绕脚底转（FigurePose.pitch，−90 = 肚子朝下趴平），这里只摆身上各节。
export type 骨 = { rot?: number[]; pos?: number[]; scale?: number | number[] };
export type 骨表 = Record<string, 骨>;

/** 伏：在库里的「蹲」上改。上身再往前压到 45°（蹲是 30°），两只爪子收在胸前（上臂往前 20°、前臂往上折 70°，拳头在下巴前下方）；
 *  尾巴翘起 15°，扭屁股时左右甩（编排.ts 叠上去）。看蛋由 看向 给 */
export const 伏: 骨表 = {
  UpBody: { rot: [45, 0, 0] },
  LeftArm: { rot: [-20, -6, 0] },
  LeftForeArm: { rot: [-70, 3, 0] },
  RightArm: { rot: [-20, 6, 0] },
  RightForeArm: { rot: [-70, -3, 0] },
  Tail: { rot: [15, 0, 0] },
  Tail2: { rot: [-15, 0, 0] },
};
/** 伏的姿势底子（库里的「蹲」：大腿抬平、膝盖往回折，髋降 8.6） */
export const 伏底 = '蹲' as const;

/** 蹬：起跳前那两帧再压低一截（髋多降 1.6、上身多压 8°），爪子往回收 */
export const 蹬: 骨表 = {
  ...伏,
  MRoot: { pos: [0, -10.2, 0] },
  mofazhang2: { pos: [0, -10.2, 0], scale: 0 },
  UpBody: { rot: [53, 0, 0] },
  LeftArm: { rot: [-8, -6, 0] },
  RightArm: { rot: [-8, 6, 0] },
};

/** 扑：两手伸过头顶往前够（像扑球），腰往后仰 25°、抬着头看蛋；两腿往后蹬直、小腿往上收一点；尾巴拖在后面。底子用「静站」（不呼吸、腿不外撇）。
 *  头的转角在 编排.ts 里按身子倾斜算（抬头） */
export const 扑: 骨表 = {
  UpBody: { rot: [-25, 0, 0] },
  LeftArm: { rot: [-160, -10, 0] },
  LeftForeArm: { rot: [-10, 0, 0] },
  RightArm: { rot: [-160, 10, 0] },
  RightForeArm: { rot: [-10, 0, 0] },
  LeftLeg: { rot: [15, 0, -4] },
  RightLeg: { rot: [5, 0, 4] },
  LeftLowerLeg: { rot: [35, 0, 0] },
  RightLowerLeg: { rot: [20, 0, 0] },
  LeftFoot: { rot: [-20, 0, 0] },
  RightFoot: { rot: [-20, 0, 0] },
  Tail: { rot: [-90, 0, 0] },
  Tail2: { rot: [0, 0, 0] },
};

/** 趴：扑空，肚子贴地趴成一长条，两手还伸在前面摁着地（蛋原来那格），腿伸直 */
export const 趴: 骨表 = {
  UpBody: { rot: [0, 0, 0] },
  LeftArm: { rot: [-170, -12, 0] },
  LeftForeArm: { rot: [0, 0, 0] },
  RightArm: { rot: [-170, 12, 0] },
  RightForeArm: { rot: [0, 0, 0] },
  LeftLeg: { rot: [4, 0, -3] },
  RightLeg: { rot: [2, 0, 3] },
  LeftLowerLeg: { rot: [10, 0, 0] },
  RightLowerLeg: { rot: [6, 0, 0] },
  LeftFoot: { rot: [-25, 0, 0] },
  RightFoot: { rot: [-25, 0, 0] },
  /** 尾巴顺着腿放平、尾巴尖翘一点（原样趴着时尾巴是背上鼓起的一大团，认不出是趴着） */
  Tail: { rot: [-100, 0, 0] },
  Tail2: { rot: [0, 0, 0] },
};

/** 抱：落地时两手张开一点、前臂往里收，抱住蛋（蛋一走就换回 趴：两手合拢摁在空地上） */
export const 抱: 骨表 = {
  ...趴,
  /** 腰仰起来 20°：脸朝前看着怀里的蛋 */
  UpBody: { rot: [-20, 0, 0] },
  LeftArm: { rot: [-170, -24, 0] },
  LeftForeArm: { rot: [-10, 28, 0] },
  RightArm: { rot: [-170, 24, 0] },
  RightForeArm: { rot: [-10, -28, 0] },
};
/** 落地那一下胸口弹起几度（绕脚底，参数.ts 的 落地弹帧 里弹完） */
export const 落地弹 = 6;

/** 撑：上身往后仰 35° 撑起来（胳膊肘支在地上、前臂往前平放），好抬头看你；小腿往上翘起来晃（编排.ts 叠上去） */
export const 撑: 骨表 = {
  ...趴,
  UpBody: { rot: [-35, 0, 0] },
  LeftArm: { rot: [-60, -8, 0] },
  LeftForeArm: { rot: [-70, 0, 0] },
  RightArm: { rot: [-60, 8, 0] },
  RightForeArm: { rot: [-70, 0, 0] },
  LeftLowerLeg: { rot: [70, 0, 0] },
  RightLowerLeg: { rot: [70, 0, 0] },
};
/** 撑着时两只小腿交替晃：幅度（度）、一来回几拍 */
export const 晃腿 = { 幅: 22, 拍: 1 };

/** 扑的时候身子从前倾多少（起跳）转到趴平（−90），转完用掉飞行时间的几成 */
export const 扑倾 = { 起: -40, 平: -90, 转完: 0.55 };

/** 看的目标点离脚底多高（看蛋看蛋的中心、看你看你的眼睛：原版玩家眼高 1.62，潜行 1.27） */
export const 蛋心高 = 0.5;
export const 你眼高 = (蹲: boolean) => (蹲 ? 1.27 : 1.62);

/** 她头大概在哪（你看她用）：伏着离脚 0.9 格高、往前 0.45；扑、趴时在身子前头 1.3 格、离地 0.25（撑起时 0.6） */
export const 她头 = { 伏: [0.45, 0.9] as const, 趴: [1.3, 0.25] as const, 撑: [1.2, 0.6] as const };

