export const auditCadence = (hashes: string, fps: number, expected: number) => {
  const timebase = hashes.match(/^#tb 0:\s*(\d+)\/(\d+)$/m);
  if (!timebase || !(Number(timebase[1]) > 0 && Number(timebase[2]) > 0)) throw Error('解码结果缺少时间基');
  const tickMs = 1000 * Number(timebase[1]) / Number(timebase[2]);
  const period = 1000 / fps;
  const times: number[] = [], repeated: number[] = [], badTiming: number[] = [];
  let previousHash = '', minMs = Infinity, maxMs = 0, maxDriftMs = 0;
  for (const line of hashes.trim().split(/\r?\n/)) {
    if (line.startsWith('#')) continue;
    const values = line.split(',').map(field => field.trim());
    if (values.length !== 6 || values[0] !== '0' || !/^-?\d+$/.test(values[2]!) || !/^[a-f0-9]{32}$/.test(values[5]!)) throw Error(`无效的解码记录：${line}`);
    const time = Number(values[2]) * tickMs, frame = times.length;
    if (frame > 0) {
      const delta = time - times[frame - 1]!, drift = Math.abs(time - times[0]! - frame * period);
      minMs = Math.min(minMs, delta); maxMs = Math.max(maxMs, delta); maxDriftMs = Math.max(maxDriftMs, drift);
      // 切片容器的毫秒取整也会带到 MP4，容许小量抖动，但不允许短长帧相抵掩盖掉帧。
      if (delta <= 0 || Math.abs(delta - period) > Math.min(period / 4, 1.5) || drift > Math.min(period / 3, 2)) badTiming.push(frame);
      if (values[5] === previousHash) repeated.push(frame);
    }
    times.push(time); previousHash = values[5]!;
  }
  if (times.length < 2) throw Error('视频不足两帧，无法验收');
  return { frames: times.length, expected, minMs, maxMs, maxDriftMs, badTiming, repeated, pass: times.length === expected && !badTiming.length };
};
