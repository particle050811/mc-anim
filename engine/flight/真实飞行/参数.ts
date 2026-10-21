// 真实飞行的可调参数（驾驶员、漂移、阵风、颠簸、镜头弹簧）、默认值和各项取值的出处。
//
// 1. 湍流：Dryden 模型，MIL-F-8785C / MIL-HDBK-1797 低空形式。侧向、竖直谱 Φ(Ω) = σ²·(L/π)·(1 + 3L²Ω²)/(1 + L²Ω²)²，
//    Lw = h，Lu = Lv = h/(0.177 + 0.000823h)^1.2（h 用英尺），σw = 0.1·W20，σv/σw = 1/(0.177 + 0.000823h)^0.4。默认取轻度（W20 15 节）。
//    1000 米/秒下对航迹只有厘米级影响，湍流在画面上只表现为高频颠簸，「航迹不直」主要来自驾驶员。
// 2. 驾驶员：McRuer 交叉模型，姿态内环 ωc 2～5 rad/s，航迹外环取内环的 1/3～1/5。侧向 ω 1.0、ζ 0.55，竖直 ω 1.4、ζ 0.65（贴树冠飞，竖直修得更紧）。
//    L1 导航：Park、Deyst、How 2004「A New Nonlinear Guidance Logic for Trajectory Tracking」。
// 3. 漂移（没有现成标准，按画面定）：侧向 σψ 2.4°、尺度 500 米，竖直 σθ 0.6°、尺度 600 米，都去掉 2.5 公里以上超长波。
//    不用湍流那种毛的谱（航向角速度每帧跳，像手抖）；不去超长波会横向偏出 120 米而航向看不出弯；σψ 太小则看不出不是直线。
// 4. 晕动：ISO 2631-1 / BS 6841 的 Wf 在 0.1～0.315 赫兹最敏感。扰动主频在 0.15～0.25 赫兹，所以镜头不横滚不跟颠簸，
//    竖直扰动比侧向小一半以上，航向角速度压在 6°/秒 以内。
// 5. 颠簸：低空高速突防的乘坐品质研究（竖直过载均方根 0.1～0.2 g、1～5 赫兹）。俯仰 0.8°（3 赫兹）、横滚 1.0°（2.4）、朝向 0.4°（2）、升沉 6 厘米（2.5），阻尼 0.3。
//    24 帧/秒下 3 赫兹是 8 帧一个周期，抽帧也看得清。
// 6. 气动导纳 k：扫帚带两个人按 120 公斤、等效 S·CLα 0.5 平方米算，约 0.0025/米；画面上看不出，留着是为了模型完整。
// 7. 镜头弹簧：游戏常用临界阻尼弹簧（Daniel Holden「Spring-It-On」、Ryan Juckett「Damped Springs」），半衰期 ≈ 1.68/ω。

export type ChannelParams = {
  频率: number; // 闭环自然频率 ω（rad/s）
  阻尼: number; // 阻尼比 ζ
  漂移: number; // 航向（俯仰）漂移的均方根（度）
  漂移尺度: number; // 漂移的长度尺度（米）
  漂移高通: number; // 漂移去掉多长的波长（一阶高通的长度尺度，米；0 = 不去）
};
export type BumpMode = { 幅度: number; 频率: number; 阻尼: number }; // 幅度：参考速度下的均方根（度）；频率：赫兹
export type 真实飞行参数 = {
  侧向: ChannelParams;
  竖直: ChannelParams;
  阵风: {
    离地: number; // 米：定 Dryden 低空的长度尺度和强度
    W20: number; // 离地 6 米的风速（米/秒）：轻度 7.7、中度 15.4、重度 23.2
    风速: number; // 平均风（米/秒）：冻结的阵风场随它平移，悬停时也有一点颠簸
    导纳: number; // k（1/米）：阵风 → 加速度 = k·V·g
  };
  颠簸: { 俯仰: BumpMode; 横滚: BumpMode; 朝向: BumpMode; 升沉: BumpMode; 参考速度: number; 速度指数: number }; // 升沉 的幅度是米
  镜头: { 频率: number; 阻尼: number };
  输入提前: number; // 锚点前输入渐弱的长度是输出渐变的几倍
  软度: number; // 竖直软下限的过渡宽度（米）
  下限平滑: number; // 竖直下限沿里程取最大、再抹平的半宽（米）
};
export const defaultParams: 真实飞行参数 = {
  侧向: { 频率: 1.0, 阻尼: 0.55, 漂移: 2.4, 漂移尺度: 500, 漂移高通: 2500 },
  竖直: { 频率: 1.4, 阻尼: 0.65, 漂移: 0.6, 漂移尺度: 600, 漂移高通: 2500 },
  阵风: { 离地: 80, W20: 7.7, 风速: 8, 导纳: 0.0025 },
  颠簸: {
    俯仰: { 幅度: 0.8, 频率: 3.0, 阻尼: 0.3 },
    横滚: { 幅度: 1.0, 频率: 2.4, 阻尼: 0.3 },
    朝向: { 幅度: 0.4, 频率: 2.0, 阻尼: 0.3 },
    升沉: { 幅度: 0.06, 频率: 2.5, 阻尼: 0.3 },
    参考速度: 1000,
    速度指数: 1,
  },
  镜头: { 频率: 2.5, 阻尼: 1.0 },
  输入提前: 1.5,
  软度: 4,
  下限平滑: 1000,
};
export type 部分<Shape> = { [Key in keyof Shape]?: Shape[Key] extends object ? 部分<Shape[Key]> : Shape[Key] };
export const deepMerge = <Shape>(defaults: Shape, overrides?: 部分<Shape>): Shape => {
  if (!overrides) return defaults;
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const base = (defaults as Record<string, unknown>)[k];
    merged[k] = base && typeof base === 'object' && typeof value === 'object' ? deepMerge(base, value as 部分<typeof base>) : value;
  }
  return merged as Shape;
};
