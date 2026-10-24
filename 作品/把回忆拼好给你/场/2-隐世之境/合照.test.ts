import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { 做机位相机 } from '@engine/三渲二/机位.tsx';
import { 投影到页面, Z朝上转three } from '@库/界面/投影.ts';
import 合照段 from '../../段/2-合照/段.ts';
import { fps, 段内正片事件帧, 段窗口, 画幅, 正片事件 } from '../../分镜.ts';
import { 正片原声增益 } from '../../配乐/正片.ts';
import { 段里那截 } from '../../声音/跨段音效.ts';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 合照镜头, 靠肩机位 } from './合照动作.ts';
import { 合照咔哒声, 咔哒声文件 } from './合照声音.ts';
import { 合照站位, 合照镜 } from './合照参数.ts';
import { 重逢机位 } from './重逢动作.ts';

const 事 = 正片事件;
const 秒 = (歌曲帧: number) => 歌曲帧 / fps;
const 找 = (名: string) => 合照段.声音?.find((c): c is 资产cue => c.资产 !== undefined && c.名 === 名);

describe('15 尾（2-合照）：窗口和事件', () => {
  it('窗口 [1271, 1322)：接在 2-重逢 后面，止在 55.08（第 129 拍，2-拼回 从这里起）', () => {
    expect(段窗口('2-合照')).toMatchObject({ 起帧: 1271, 止帧: 1322, 帧数: 51 });
    expect(段窗口('2-重逢').止帧).toBe(段窗口('2-合照').起帧);
    expect(Math.round(55.08 * fps)).toBe(1322);
    expect(合照段.帧数).toBe(51);
  });

  it('段内帧：尾笑 0、靠肩 20、咔哒 41；照片就是咔哒那一帧', () => {
    const 内 = 段内正片事件帧('2-合照');
    expect([内.尾笑, 内.靠肩, 内.合照咔哒, 内['照片-合照']]).toEqual([0, 20, 41, 41]);
  });

  it('两个看得清的镜头都不短于 0.5 秒；咔哒起到段尾整屏白，接片尾的白', () => {
    expect(秒(事.靠肩.帧 - 事.尾笑.帧)).toBeGreaterThanOrEqual(0.5);
    expect(秒(事.合照咔哒.帧 - 事.靠肩.帧)).toBeGreaterThanOrEqual(0.5);
    const { 起帧, 止帧 } = 段窗口('2-合照');
    for (let 帧 = 起帧; 帧 < 止帧; 帧++) {
      expect(合照镜头(帧), `帧 ${帧}`).toBe(帧 < 事.靠肩.帧 ? '笑' : 帧 < 事.合照咔哒.帧 ? '靠肩' : '白');
    }
  });
});

describe('15 尾：尾笑的机位就是 2-重逢 推脸推完的那个', () => {
  it('整镜不动，和 2-重逢 末帧差不到 0.5%', () => {
    const 末 = 重逢机位(秒(事.尾笑.帧 - 1));
    const 停 = 重逢机位(秒(事.尾笑.帧));
    const 近 = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    for (let 帧 = 事.尾笑.帧; 帧 < 事.靠肩.帧; 帧++) {
      const 机 = 重逢机位(秒(帧));
      近(机.眼, 停.眼);
      近(机.看, 停.看);
      expect(机.视角).toBeCloseTo(停.视角, 9);
    }
    近(停.眼, 末.眼);
    expect(Math.abs(停.视角 / 末.视角 - 1)).toBeLessThan(0.005);
  });
});

describe('15 尾：靠肩的取景（新合照，片尾取正中的正方形做 PCL 图标）', () => {
  it('N、顶面是偶数，顶面不超过 N', () => {
    expect(合照镜.N % 2).toBe(0);
    expect(合照镜.顶面 % 2).toBe(0);
    expect(合照镜.顶面).toBeLessThanOrEqual(合照镜.N);
  });

  it('两个人从脚到头顶都在画面正中的正方形里（页面 x 280～1000），头顶不出上沿', () => {
    const cam = 做机位相机(靠肩机位, 画幅.宽, 画幅.高, canvasDpr(1));
    const 投 = (p: readonly [number, number, number]) => 投影到页面(cam, Z朝上转three([p[0], p[1], p[2]]), 画幅.宽, 画幅.高);
    const 方 = { 左: (画幅.宽 - 画幅.高) / 2, 右: (画幅.宽 + 画幅.高) / 2 };
    for (const 脚 of [合照站位.她, 合照站位.你]) {
      for (const 高 of [0, 1, 2]) {
        for (const 横 of [-0.5, 0.5]) {
          const q = 投([脚[0], 脚[1] + 横, 脚[2] + 高]);
          expect(q.x).toBeGreaterThan(方.左);
          expect(q.x).toBeLessThan(方.右);
          expect(q.y).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('15 尾：声音、歌词', () => {
  it('原声放满窗口，增益固定', () => {
    expect(找('原声')).toMatchObject({ 帧: 0, 帧数: 51, 入点秒: 1271 / fps, 增益: 正片原声增益 });
  });

  it('咔哒主音离闪白那一帧不到半帧；段里放到段尾，剩下的一截从片尾那段段头接着放', () => {
    expect(Math.abs(秒(合照咔哒声.起帧) + 咔哒声文件.起音秒 - 秒(事.合照咔哒.帧))).toBeLessThan(0.5 / fps);
    const a = 找('咔哒')!;
    expect(a.帧).toBe(合照咔哒声.起帧 - 段窗口('2-合照').起帧);
    expect(a.帧 + a.帧数).toBe(51);
    expect(a.入点秒).toBeUndefined();
    const b = 段里那截({ 起帧: 段窗口('2-合照').止帧, 止帧: 段窗口('2-合照').止帧 + 48 }, 合照咔哒声)!;
    expect(b.帧).toBe(0);
    expect(b.入点秒).toBeCloseTo(a.帧数 / fps, 12);
    expect(a.帧数 + b.帧数).toBe(Math.ceil(咔哒声文件.时长秒 * fps));
  });

  it('「爱炙热的你却忘了爱自己」段头已经在场，咔哒前最后一个字已经唱出', () => {
    const 行 = 正片歌词行(15, 段窗口('2-合照').起帧);
    expect(行.入).toBeLessThan(0);
    expect(Math.max(...行.解)).toBeLessThan(段内正片事件帧('2-合照').合照咔哒);
  });
});
