// 分阶段计时（still、渲段、film）：打包、开浏览器、读组合（getCompositions）、等闸、出帧、编码各花多久，看清时间花在哪。
// 写进这条命令运行记录的「阶段」字段，另追加到 run/logs/阶段耗时.tsv；耗时.tsv 的列不动（预计耗时还按它算）。
// 编码 = renderMedia 出完最后一帧到返回（Remotion 边出帧边编码，这里只剩收尾编码）；声音 = 渲段另出 wav；段签 = 渲完从切片派生段签（pipeline/验收/段签.ts）。
// 外层阶段包含里层（打包含备素材、webpack；段签含 段签：开头的几步），加总时别重复算。每帧明细见 渲染明细.ts。
import fs from 'node:fs';
import path from 'node:path';
import { timingLogPath, config } from '../环境/配置.ts';

export type StageName =
  | '准备' | '算指纹' | '清旧' | '打包' | '备素材' | 'webpack' | '开浏览器' | '读组合' | '等求解缓存' | '等闸' | '出帧' | '编码' | '查帧数' | '段签' | '删旧'
  | '段签：算字节' | '段签：扫切片' | '段签：存声音' | '段签：写入'
  | '取母版' | '取段签' | '取叠层' | '排字幕' | '做字幕层' | '拼声音' | '拉响度' | '压成片' | '写表' | '核对声音' | '分享版' | '写清单' | '渲段' | '声音' | '接画面';
export type StageRecord = { label: string; stage: StageName; startedAt: string; sec: number };

const headerLine = '开始（UTC）\t标签\t阶段\t秒\t主机\tpid\n';
export const stageTablePath = () => path.join(path.dirname(timingLogPath()), '阶段耗时.tsv');

const utc = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const oneLine = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

/** 记一个阶段：收进 收（运行记录的 阶段 字段），追加一行到阶段表；写表失败只提示，不影响渲染 */
export const recordPhase = (records: StageRecord[] | undefined, label: string, stage: StageName, startMs: number, elapsedSec: number, stageFile = stageTablePath()): StageRecord => {
  const r: StageRecord = { label: label, stage: stage, startedAt: utc(startMs), sec: Number(elapsedSec.toFixed(2)) };
  records?.push(r);
  try {
    fs.mkdirSync(path.dirname(stageFile), { recursive: true });
    const line = `${r.startedAt}\t${oneLine(label)}\t${stage}\t${r.sec.toFixed(2)}\t${oneLine(config('主机'))}\t${process.pid}\n`;
    if (!fs.existsSync(stageFile)) fs.writeFileSync(stageFile, headerLine + line, 'utf8');
    else fs.appendFileSync(stageFile, line, 'utf8');
  } catch (e) {
    console.error(`!! 阶段耗时没写成：${(e as Error).message}`);
  }
  return r;
};

/** 量 fn 这一段（抛错也记） */
export const measureStage = async <T>(stageLog: StageRecord[] | undefined, label: string, stage: StageName, fn: () => Promise<T>, stageFile?: string): Promise<T> => {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    recordPhase(stageLog, label, stage, t0, (Date.now() - t0) / 1000, stageFile);
  }
};

/** 一串挨着的步骤：每调一次记下从上一次调用到现在这段（长函数里不用把每步包成回调） */
export const stageTiming = (records: StageRecord[] | undefined, label: string, timingFile?: string) => {
  let prevTime = Date.now();
  return (stage: StageName) => {
    const now = Date.now();
    recordPhase(records, label, stage, prevTime, (now - prevTime) / 1000, timingFile);
    prevTime = now;
  };
};

/** renderMedia 的 onProgress 记下出完最后一帧的时刻，返回后拆成 出帧、编码 两段 */
export const frameEncodeTiming = () => {
  let frameOutMs: number | null = null;
  return {
    onProgress: (p: { renderedDoneIn: number | null }) => {
      if (p.renderedDoneIn !== null) frameOutMs = p.renderedDoneIn;
    },
    split: (totalMs: number) => {
      const frameOutputMs = Math.min(frameOutMs ?? totalMs, totalMs);
      return { 出帧秒: frameOutputMs / 1000, encodeSec: (totalMs - frameOutputMs) / 1000 };
    },
  };
};

/** 一行给人看的小结：打包 12.3 秒、开浏览器 0.8 秒… */
export const stageSummary = (rs: readonly StageRecord[]) => rs.map((r) => `${r.stage} ${r.sec.toFixed(1)} 秒`).join('、');
