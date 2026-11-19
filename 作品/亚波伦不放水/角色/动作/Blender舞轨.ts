import type { BonePose } from '@engine/model/基岩模型.tsx';

export const danceFormat = { version: 1, fps: 60, frameCount: 846 } as const;
type Channel = 'rot' | 'pos' | 'scale';
type FrameKey = [number, number, number, number];
type BoneTrack = Partial<Record<Channel, FrameKey[]>>;
export type DanceRevision = typeof danceFormat & { bones: Record<string, BoneTrack> };

const fail = (where: string, why: string): never => { throw new Error(`Blender 舞轨 ${where}：${why}`); };
const objectAt = (value: unknown, where: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) return fail(where, '需要 JSON 对象');
  return value as Record<string, unknown>;
};

export const parseDanceRevision = (value: unknown, names: ReadonlySet<string>): DanceRevision => {
  const root = objectAt(value, '根');
  for (const key of Object.keys(root)) if (!['version', 'fps', 'frameCount', 'bones'].includes(key)) fail(key, '未知字段');
  for (const [key, expected] of Object.entries(danceFormat)) if (root[key] !== expected) fail(key, `应为 ${expected}`);
  const bones: Record<string, BoneTrack> = Object.create(null);
  for (const [name, value] of Object.entries(objectAt(root.bones, 'bones'))) {
    if (!names.has(name)) fail(name, '模型中没有这根骨骼');
    const track = objectAt(value, name);
    if (!Object.keys(track).length) fail(name, '至少给一个通道');
    const checked: BoneTrack = {};
    for (const [channel, keys] of Object.entries(track)) {
      const where = `${name}.${channel}`;
      if (channel !== 'rot' && channel !== 'pos' && channel !== 'scale') fail(where, '未知通道');
      if (!Array.isArray(keys) || !keys.length) return fail(where, '关键帧必须为非空数组');
      let previous = -1;
      checked[channel as Channel] = Array.from(keys, (row, index): FrameKey => {
        const at = `${where}[${index}]`;
        if (!Array.isArray(row) || row.length !== 4 || !Array.from(row).every(Number.isFinite)) return fail(at, '需要四个有限数字 [f,x,y,z]');
        const [frame, x, y, z] = row;
        if (!Number.isInteger(frame) || frame < 0 || frame >= danceFormat.frameCount) fail(at, `帧号须为 0..${danceFormat.frameCount - 1} 的整数`);
        if (frame <= previous) fail(at, '帧号须严格递增，不可重复');
        previous = frame;
        return [frame, x, y, z];
      });
    }
    bones[name] = checked;
  }
  return { ...danceFormat, bones };
};

const sampleChannel = (keys: FrameKey[], frame: number, rotation: boolean): number[] => {
  let start = 0, end = keys.length - 1;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (keys[middle]![0] < frame) start = middle + 1;
    else end = middle;
  }
  const right = keys[end]!;
  if (end === 0 || frame >= right[0]) return right.slice(1);
  const left = keys[end - 1]!;
  const mix = (frame - left[0]) / (right[0] - left[0]);
  return left.slice(1).map((from, axis) => {
    const to = right[axis + 1]!;
    if (!rotation) return (1 - mix) * from + mix * to;
    const delta = ((to % 360 - from % 360 + 900) % 360) - 180;
    return from + mix * (delta === -180 && to > from ? 180 : delta);
  });
};

export const sampleDanceRevision = (revision: DanceRevision, frame: number): Record<string, BonePose> => {
  if (!Number.isFinite(frame)) return fail('采样帧', '需要有限数字');
  const nearest = Math.round(frame);
  const sampleFrame = Math.abs(nearest - frame) < 1e-9 ? nearest : frame;
  return Object.fromEntries(Object.entries(revision.bones).map(([name, track]) => [name, Object.fromEntries(
    Object.entries(track).map(([channel, keys]) => [channel, sampleChannel(keys, sampleFrame, channel === 'rot')]),
  )]));
};
