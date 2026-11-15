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
  frequency: number; // 闭环自然频率 ω（rad/s）
  damping: number; // 阻尼比 ζ
  drift: number; // 航向（俯仰）漂移的均方根（度）
  driftScale: number; // 漂移的长度尺度（米）
  driftHighPass: number; // 漂移去掉多长的波长（一阶高通的长度尺度，米；0 = 不去）
};
export type BumpMode = { amplitude: number; frequency: number; damping: number }; // 幅度：参考速度下的均方根（度）；频率：赫兹
export type RealFlightParams = {
  lateral: ChannelParams;
  vertical: ChannelParams;
  gust: {
    altitudeM: number; // 米：定 Dryden 低空的长度尺度和强度
    W20: number; // 离地 6 米的风速（米/秒）：轻度 7.7、中度 15.4、重度 23.2
    windSpeed: number; // 平均风（米/秒）：冻结的阵风场随它平移，悬停时也有一点颠簸
    admittance: number; // k（1/米）：阵风 → 加速度 = k·V·g
  };
  bump: { pitch: BumpMode; roll: BumpMode; facing: BumpMode; heave: BumpMode; refSpeed: number; speedExponent: number }; // 升沉 的幅度是米
  cameraSpring: { frequency: number; damping: number };
  inputLead: number; // 锚点前输入渐弱的长度是输出渐变的几倍
  softWidth: number; // 竖直软下限的过渡宽度（米）
  floorSmooth: number; // 竖直下限沿里程取最大、再抹平的半宽（米）
};
export const defaultParams: RealFlightParams = {
  lateral: { frequency: 1.0, damping: 0.55, drift: 2.4, driftScale: 500, driftHighPass: 2500 },
  vertical: { frequency: 1.4, damping: 0.65, drift: 0.6, driftScale: 600, driftHighPass: 2500 },
  gust: { altitudeM: 80, W20: 7.7, windSpeed: 8, admittance: 0.0025 },
  bump: {
    pitch: { amplitude: 0.8, frequency: 3.0, damping: 0.3 },
    roll: { amplitude: 1.0, frequency: 2.4, damping: 0.3 },
    facing: { amplitude: 0.4, frequency: 2.0, damping: 0.3 },
    heave: { amplitude: 0.06, frequency: 2.5, damping: 0.3 },
    refSpeed: 1000,
    speedExponent: 1,
  },
  cameraSpring: { frequency: 2.5, damping: 1.0 },
  inputLead: 1.5,
  softWidth: 4,
  floorSmooth: 1000,
};
export type DeepPartial<Shape> = { [Key in keyof Shape]?: Shape[Key] extends object ? DeepPartial<Shape[Key]> : Shape[Key] };
export const deepMerge = <Shape>(defaults: Shape, overrides?: DeepPartial<Shape>): Shape => {
  if (!overrides) return defaults;
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const base = (defaults as Record<string, unknown>)[k];
    merged[k] = base && typeof base === 'object' && typeof value === 'object' ? deepMerge(base, value as DeepPartial<typeof base>) : value;
  }
  return merged as Shape;
};
