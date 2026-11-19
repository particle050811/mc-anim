import { parseAnimationFile, sampleAnim } from 'mc-anim/engine/anim/基岩动画.ts';

type Channel = 'rot' | 'pos' | 'scale';
export type ProjectMotion = {
  name: string;
  slot: 'main' | 'extra';
  track: {
    lengthSec?: number;
    loop?: boolean | 'hold_on_last_frame';
    bones: Record<string, Partial<Record<Channel, number[][]>>>;
  };
};

const channelNames = { rot: 'rotation', pos: 'position', scale: 'scale' } as const;

export function bindMotion(motion: ProjectMotion, names: ReadonlySet<string>) {
  const { track } = motion;
  if (Object.keys(track).some(key => !['lengthSec', 'loop', 'bones'].includes(key)) ||
      (track.loop !== undefined && typeof track.loop !== 'boolean' && track.loop !== 'hold_on_last_frame') ||
      (track.lengthSec !== undefined && (!Number.isFinite(track.lengthSec) || track.lengthSec < 0))) throw Error('不支持的动作属性');
  const bones = Object.fromEntries(Object.entries(track.bones).map(([name, channels]) => {
    if (!names.has(name)) throw Error(`动作引用未知骨骼：${name}`);
    return [name, Object.fromEntries(Object.entries(channels).map(([key, rows]) => {
      if (!Object.hasOwn(channelNames, key) || !Array.isArray(rows) || !rows.length) throw Error(`非法通道 ${name}.${key}`);
      let previous = -1;
      return [channelNames[key as Channel], Object.fromEntries(rows.map(row => {
        if (!Array.isArray(row) || row.length !== 4 || !row.every(Number.isFinite) || row[0]! < 0 || row[0]! <= previous) throw Error(`${name}.${key} 非数值键或时间乱序`);
        previous = row[0]!;
        return [previous, row.slice(1)];
      }))];
    }))];
  }));
  const animation = parseAnimationFile({ animations: { clip: { animation_length: track.lengthSec, loop: track.loop, bones } } }).clip!;
  return (sec: number) => sampleAnim(animation, sec).skeleton;
}
