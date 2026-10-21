// 台词落点、同步表：从段.ts 的声音 cue 算全片帧（字幕和同步表都不再从各段代码里扒）；叠层滤镜串。
import { describe, expect, it } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import { 同步表, 算台词落点 } from './台词落点.ts';
import { 叠层滤镜 } from './叠层.ts';
import { 设字库 } from './字幕卡.ts';

const 段 = (键: string, 帧数: number, 声音: { 帧: number; 台词?: string; 资产?: string }[]) =>
  ({ 键, 段: { 场: '测试', 帧数, fps: 24, 宽: 1280, 高: 720, 地形: [], 声音 } }) as unknown as 段信息;

// 断屏只要字宽：每个字 9 个界面像素
设字库(new Proxy({}, { get: () => ({ w: 16, h: 16, scale: 0.5, adv: 9, shadow: 0.5, top: 0, rows: [] }) }) as never);

describe('台词落点', () => {
  it('cue 帧是开口：文件头 = 段起帧 + 帧 − 开口秒 × fps；位置取台词表，没写是 下', () => {
    const 截们 = [
      { 段: 段('甲', 100, [{ 帧: 10, 资产: '音效/钟' }]), 全片起帧: 0 },
      { 段: 段('乙', 80, [{ 帧: 5, 台词: '6-李樱-走' }, { 帧: 40, 台词: '6-九胡-停' }]), 全片起帧: 100 },
    ];
    const 表 = [
      { id: '6-李樱-走', 角色: '李樱', 文本: '走吧。', 配音: '配音/6-李樱-走' },
      { id: '6-九胡-停', 角色: '九胡', 文本: '等等，先别动！', 配音: '配音/6-九胡-停', 字幕位置: '思索上' as const },
    ];
    const r = 算台词落点(截们, 表, (id) => `/库/${id}`, new Map([['6-李樱-走', 0.03]]));
    expect(r.map((a) => [a.id, a.段, a.段内帧, a.文件头帧, a.文件, a.位置])).toEqual([
      ['6-李樱-走', '乙', 5, 100 + 5 - 0.03 * 24, '/库/配音/6-李樱-走', '下'],
      ['6-九胡-停', '乙', 40, 140, '/库/配音/6-九胡-停', '思索上'],
    ]);
    expect(r[1]!.屏们.map((p) => p.字)).toEqual(['等等，先别动！']);
  });

  it('台词不在表里、没配音都报错', () => {
    const 截们 = [{ 段: 段('甲', 10, [{ 帧: 1, 台词: '6-李樱-无' }]), 全片起帧: 0 }];
    expect(() => 算台词落点(截们, [], (x) => x, new Map())).toThrow(/不在 story\/台词.toml/);
    expect(() => 算台词落点(截们, [{ id: '6-李樱-无', 角色: '李樱', 文本: '嗯' }], (x) => x, new Map())).toThrow(/还没配音/);
  });

  it('同步表：cue 换成全片帧，成片声音里 ±1 帧内有起音的记对上', () => {
    const 截们 = [
      { 段: 段('甲', 24, [{ 帧: 12, 资产: '音效/钟' }]), 全片起帧: 0 },
      { 段: 段('乙', 24, [{ 帧: 3, 资产: '音效/鼓' }]), 全片起帧: 24 },
    ];
    const 混 = new Float32Array(48 * 2000);
    for (let i = 12 * 2000; i < 20 * 2000; i++) 混[i] = 0.5 * Math.sin(i / 3); // 第 12 帧起响，第 27 帧那条没声音
    const r = 同步表(截们, 混, 24);
    expect([r.对上, r.总]).toEqual([1, 2]);
    const 行 = r.tsv.trim().split('\n').slice(1).map((l) => l.split('\t'));
    expect(行.map((x) => [x[0], x[2], x[3], x[6]])).toEqual([
      ['甲', '12', '12', '对上（第 12 帧）'],
      ['乙', '27', '3', '没测到（被盖住或太轻）'],
    ]);
  });
});

describe('叠层滤镜', () => {
  it('视频层 trim 后挪到起帧，静图 loop；一层层 overlay，eof_action=pass', () => {
    const [输入, 滤镜, 出] = 叠层滤镜(
      [
        { 文件: 'a.mov', 起帧: 100, 帧数: 30, x: 0, y: 0, 静图: false, 取自帧: 0 },
        { 文件: 'b.png', 起帧: 120, 帧数: 12, x: 640, y: 600, 静图: true, 取自帧: 0 },
      ],
      3,
      'cat',
      24,
    );
    expect(输入).toEqual(['-i', 'a.mov', '-framerate', '24', '-i', 'b.png']);
    expect(滤镜).toBe(
      '[3:v]trim=start_frame=0:end_frame=30,setpts=N/(24*TB)+100/(24*TB)[l0];[cat][l0]overlay=x=0:y=0:eof_action=pass[o0];' +
        '[4:v]format=rgba,loop=loop=11:size=1:start=0,setpts=N/(24*TB)+120/(24*TB)[l1];[o0][l1]overlay=x=640:y=600:eof_action=pass[o1]',
    );
    expect(出).toBe('o1');
  });
});
