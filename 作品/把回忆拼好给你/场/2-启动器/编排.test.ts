import { describe, expect, it } from 'vitest';
import { 画幅, 正片事件 } from '../../分镜.ts';
import { 图标边 } from '../../界面/实例图标.ts';
import { 卡们, 布局, 光标, 钻入, 碎片, 取景中心, 尺 } from './参数.ts';
import { 光标在, 卡排, 图标框, 行态在, 钻入取景, 钻入进度, 钻入透, 碎块们, 碎块在, 片尾白光, 署名位 } from './编排.ts';

const 鼓点 = 正片事件.开场鼓点.帧;

describe('第 0 镜：光标、悬停、按下', () => {
  it('第一帧没有光标、这一行不亮（和片尾最后一帧同构图，能接回开头）', () => {
    expect(光标在(0)).toBeNull();
    expect(行态在(0)).toBe(0);
  });
  it('光标到了停在这一行上，这一行悬停；鼓点那一帧按下，光标还在', () => {
    expect(光标在(正片事件.开场光标到.帧)).toEqual(光标.停);
    expect(行态在(正片事件.开场光标到.帧)).toBe(1);
    expect(光标在(鼓点)).toEqual(光标.停);
    expect(行态在(鼓点)).toBe(2);
    expect(光标在(鼓点 + 1)).toBeNull();
  });
  it('光标停在六月樱这一行里、图标框外（箭头 12×19 不压照片）', () => {
    expect(光标.停.x).toBeGreaterThanOrEqual(图标框.x + 图标框.边 + 1);
    expect(光标.停.y).toBeGreaterThanOrEqual(卡排[0]!.行起 + 布局.悬停让.上);
    expect(光标.停.y + 19).toBeLessThanOrEqual(卡排[0]!.行起 + 布局.行高);
    expect(图标框.y).toBe(卡排[0]!.行起 + 布局.图标.y);
  });
});

describe('版本列表', () => {
  it('六月樱（Forge 整合包）在第一张卡片「可安装 Mod」的第一行，原版正式版在「常规版本」', () => {
    expect(卡们[0].头).toBe('可安装 Mod');
    expect(卡们[0].实例们[0].图标).toBe('合照');
    expect(卡们[1].头).toBe('常规版本');
  });
  it('卡片一张接一张、不重叠', () => {
    for (let k = 1; k < 卡排.length; k++) expect(卡排[k]!.上).toBe(卡排[k - 1]!.底 + 布局.卡间);
  });
});

describe('钻进图标', () => {
  it('最后一帧有启动器的画面：图标（连外圈 1 界面像素的灰边）铺满画面、照片全透，下一帧去掉启动器不跳', () => {
    const 末 = 鼓点 + 钻入.帧 - 1;
    const { p, q } = 钻入进度(末);
    expect(p).toBe(1);
    expect(钻入透(q)).toBe(1);
    const t = 钻入取景(q);
    expect(图标框.边 * t.尺).toBeGreaterThanOrEqual(画幅.宽 * 2);
    expect(图标框.边 * t.尺).toBeGreaterThanOrEqual(画幅.高 * 2);
    expect(t.中心.x).toBeCloseTo(图标框.x + 图标框.边 / 2);
    expect(t.中心.y).toBeCloseTo(图标框.y + 图标框.边 / 2);
  });
  it('鼓点那一帧还是平常的取景（接 2-六月樱 最后一帧）', () => {
    const t = 钻入取景(钻入进度(鼓点).q);
    expect(t.尺).toBe(12);
  });
});

describe('片尾碎片', () => {
  const 回色 = 正片事件.片尾回色.帧 - 正片事件.片尾白光.帧;
  it('64 块碎片正好铺满图标，一格一块', () => {
    const 块数 = 图标边 / 碎片.碎块边;
    expect(碎块们.length).toBe(块数 * 块数);
    expect(new Set(碎块们.map((b) => `${b.i},${b.j}`)).size).toBe(碎块们.length);
  });
  it('回色前一帧全部到位，回色那一帧没有白光', () => {
    for (const b of 碎块们) expect(碎块在(b, 回色 - 1).到).toBe(true);
    expect(片尾白光(回色, 回色)).toBe(0);
    expect(片尾白光(0, 回色)).toBeGreaterThan(0);
  });
  it('第一帧没有一块已经到位（白光里先看见碎片往里飞）', () => {
    for (const b of 碎块们) expect(碎块在(b, 0).到).toBe(false);
  });
  it('署名整个在画里、在最下面那张卡的卡片头那一行', () => {
    const 宽 = 画幅.宽 * 2, 高 = 画幅.高 * 2;
    const 位 = 署名位(40, 宽);
    expect(Number.isInteger(位.x) && Number.isInteger(位.y)).toBe(true);
    expect(位.x).toBeGreaterThan(取景中心.x - 宽 / 2 / 尺);
    expect(位.x + 40).toBeLessThan(取景中心.x + 宽 / 2 / 尺);
    expect(位.y).toBe(卡排[卡排.length - 1]!.上 + 布局.卡头字.y);
    expect(位.y + 9).toBeLessThan(取景中心.y + 高 / 2 / 尺);
  });
});
