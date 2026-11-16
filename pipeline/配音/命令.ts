// anim voice list|check|gen|use|lip|backends：配音链。作品的 台词.toml 是唯一人写的源；候选进 <数据根>/run/草稿/配音/，成品登记成私有资产，
// 每句的运行时数据写成 <作品根>/台词/<id>.ts（句模块），段只引自己用的几句。步骤：写 台词.toml 一句 → gen 出候选 → 试听挑一个 → use 定稿（登记、写回、出口型）。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { config, dataRoot } from '../环境/配置.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { relativeToCodeRoot } from '../环境/路径.ts';
import { registerAsset } from '../资产/命令.ts';
import { workAssetRegistryDir, readAssetRegistryBoth } from '../资产/资产表.ts';
import { workAssetLockPath, bytesPath, readAssetLock, assetLockPath, type AssetLock } from '../资产/资产锁.ts';
import { passGate, passRenderGate } from '../闸/闸.ts';
import { SchedYieldError } from '../闸/指令.ts';
import { oldLineRenames, oldTableAssets } from './旧表.ts';
import { listSentenceModules, sentenceDir, sentencePath, writeSentenceText, readSentenceModule } from './句模块.ts';
import { reviewGroup, runVoicePy } from './python.ts';
import { listCandidates, reviewReportText, writeCandidateNote, unpackReply, type ReviewReply, type ReviewRequest, type ReviewItem } from './复核.ts';
import { editLineField, spokenTextOf, voiceTextHash, readWorkLines, type WorkLines, type VoiceLineRow } from './台词表.ts';
import { candidateDir, sentenceIssues, finishedSha, manualFixUsable, assembleSentence, buildSynthBatches, readCandidateNote, timbreRef, wavSeconds, type CharTimings, type Measure } from './配音.ts';

const linesFile = () => path.join(workRoot(), '台词.toml');
const readBothLocks = (): AssetLock => ({ ...readAssetLock(assetLockPath()), ...readAssetLock(workAssetLockPath(workRoot())) });
const readTable = (): WorkLines => {
  const t = readWorkLines(linesFile());
  if (!t) throw new Error(`${relativeToCodeRoot(linesFile())} 不存在：这部作品还没有台词表`);
  return t;
};
const selectLines = (workLineTable: WorkLines, prefixes: string[], withVoice = false) => {
  const lines = workLineTable.lines.filter((t) => !prefixes.length || prefixes.some((p) => t.id.startsWith(p)));
  if (prefixes.length && !lines.length) throw new UsageError(`台词.toml 里没有以 ${prefixes.join('、')} 开头的台词`);
  return withVoice ? lines.filter((t) => t.voice) : lines;
};
const finishedFile = (line: VoiceLineRow, assetLock: AssetLock) => bytesPath(assetLock[line.voice!]!, dataRoot());

/** 要这台机器的位置的后端：程序位置取 anim 配置（anim.local.toml、环境变量）。别的后端不用在这登记，用 Python 那边的默认参数 */
const localSettings = (): Record<string, Record<string, unknown>> => ({
  'image-flow': { imgflow: config('image_flow') },
});
/** 后端的设置：本机设置，再盖上 台词.toml 的 [配音.后端参数.<后端>] */
const backendConfig = (workLineTable: WorkLines | null, backendName: string): Record<string, unknown> => ({ ...(localSettings()[backendName] ?? {}), ...(workLineTable?.voice.后端参数[backendName] ?? {}) });

type BackendInfo = { name: string; note: string; 本机: boolean; 云端: boolean; 付费: boolean; 缺: string[] };

// ---------- lip：字 → 嘴 → 句模块 ----------

type SentenceOptions = { realign?: boolean; newMeasures?: Map<string, Measure> };

/** 给这些句子出句模块：字取 口型手修 > （不重对齐时）旧句模块 > 对齐器；测量取 新测量 > 旧句模块（同一版成品） */
const exportSentences = async (lines: VoiceLineRow[], o: SentenceOptions) => {
  const assetLock = readBothLocks();
  const pending: { 行: VoiceLineRow; sha: string; measure: Measure; fileDurationSec: number; char?: CharTimings; manualFix: boolean }[] = [];
  for (const line of lines) {
    const sha = finishedSha(line, assetLock);
    if (!sha) throw new Error(`${line.id}：配音「${line.voice}」不在资产锁里`);
    const fileDurationSec = wavSeconds(fs.readFileSync(finishedFile(line, assetLock)));
    const oldSentence = readSentenceModule(sentencePath(workRoot(), line.id));
    const sameVersion = oldSentence?.finishedSha === sha ? oldSentence : null;
    const measure = o.newMeasures?.get(line.id) ?? (sameVersion ? { mouthOpen: sameVersion.mouthOpen, 有声长: sameVersion.有声长, duration: sameVersion.duration } : null);
    if (!measure) throw new Error(`${line.id}：没有这版成品的测量（开口、有声长、时长），先 anim voice use 定稿`);
    let chars: CharTimings | undefined;
    const manualFix = manualFixUsable(line, sha);
    if (line.lipManual?.char && !manualFix) console.error(`${line.id}：口型手修 绑的成品不是现在这版，不用它，照常对齐（重标后改 口型手修.成品sha）`);
    if (manualFix) chars = line.lipManual!.char!;
    else if (!o.realign && sameVersion && !sameVersion.手修 && sameVersion.spoken === spokenTextOf(line)) chars = sameVersion.char as CharTimings;
    pending.push({ 行: line, sha, measure, fileDurationSec, char: chars, manualFix });
  }
  const needAlign = pending.filter((b) => !b.char);
  if (needAlign.length) {
    const frozenLock = assetLock;
    const alignItems = needAlign.map((b) => ({ id: b.行.id, wav: finishedFile(b.行, frozenLock), spoken: spokenTextOf(b.行), language: b.行.language ?? '中文' }));
    console.error(`对齐 ${alignItems.length} 句（Qwen3-ForcedAligner，CPU）…`);
    const alignment = await passGate(() => runVoicePy<Record<string, CharTimings>>('对齐', { 目录: config('对齐器'), 句: alignItems }));
    for (const b of needAlign) b.char = alignment[b.行.id]!;
  }
  const mouthShapes = await runVoicePy<Record<string, [number, string][]>>('嘴', { 句: pending.map((b) => ({ id: b.行.id, spoken: spokenTextOf(b.行), duration: b.fileDurationSec, char: b.char })) });
  fs.mkdirSync(sentenceDir(workRoot()), { recursive: true });
  let toml = fs.readFileSync(linesFile(), 'utf8');
  const written: string[] = [];
  for (const b of pending) {
    const sentence = assembleSentence(b.行, { finishedSha: b.sha, measure: b.measure, fileDurationSec: b.fileDurationSec, char: b.char!, manualFix: b.manualFix, mouthKeys: mouthShapes[b.行.id]! });
    const f = sentencePath(workRoot(), b.行.id);
    const sourceText = writeSentenceText(sentence);
    if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== sourceText) {
      fs.writeFileSync(f, sourceText);
      written.push(f);
    }
    toml = editLineField(toml, b.行.id, { mouthOpen: sentence.mouthOpen, lip: { finishedSha: b.sha } });
    console.log(`${b.行.id}：${b.manualFix ? '手修' : b.char && needAlign.includes(b) ? '对齐' : '沿用'}的字 ${sentence.char.length} 个，嘴 ${sentence.嘴.map((x) => x[1]).join('')}`);
  }
  if (toml !== fs.readFileSync(linesFile(), 'utf8')) fs.writeFileSync(linesFile(), toml);
  return written;
};

// ---------- check ----------

const verifyLines = async (workLineTable: WorkLines, lines: VoiceLineRow[]): Promise<string[]> => {
  const assetLock = readBothLocks();
  const issues: string[] = [];
  const withSentence: { 行: VoiceLineRow; 句: NonNullable<ReturnType<typeof readSentenceModule>> }[] = [];
  for (const line of lines) {
    const f = sentencePath(workRoot(), line.id);
    const sentence = readSentenceModule(f);
    for (const x of sentenceIssues(line, assetLock, sentence)) issues.push(`${line.id}：${x}`);
    if (!sentence) continue;
    if (fs.readFileSync(f, 'utf8') !== writeSentenceText(sentence)) issues.push(`${line.id}：句模块被手改过（格式不是 anim voice 写的；改 台词.toml 后 anim voice lip）`);
    const voicePath = line.voice && assetLock[line.voice] ? bytesPath(assetLock[line.voice]!, dataRoot()) : null;
    if (voicePath && fs.existsSync(voicePath) && wavSeconds(fs.readFileSync(voicePath)) !== sentence.文件秒数) issues.push(`${line.id}：句模块的 文件秒数 ${sentence.文件秒数} 和成品不符`);
    withSentence.push({ 行: line, 句: sentence });
  }
  const lineIds = new Set(workLineTable.lines.map((t) => t.id));
  for (const id of listSentenceModules(workRoot())) if (!lineIds.has(id)) issues.push(`台词/${id}.ts：台词.toml 里没有这一句（删掉，或把这句写回 台词.toml）`);
  // 嘴由字确定地算出：重算一遍逐项比
  if (withSentence.length) {
    const mouthShapes = await runVoicePy<Record<string, [number, string][]>>('嘴', { 句: withSentence.map(({ 句: sentence }) => ({ id: sentence.id, spoken: sentence.spoken, duration: sentence.文件秒数, char: sentence.char })) });
    for (const { 句: sentence } of withSentence) if (JSON.stringify(mouthShapes[sentence.id]) !== JSON.stringify(sentence.嘴)) issues.push(`${sentence.id}：按字重算的嘴和句模块里的不一样（口型规则或 pypinyin 变了？）`);
  }
  return issues;
};

// ---------- review ----------

type ReviewItemInfo = { name: string; note: string; 云端: boolean; 付费: boolean; 默认: boolean; 缺: string[] };

/** 复核这几句的全部候选（现成品一起量，当对照）：结果并进候选旁的 .json，每句写 <候选目录>/复核.md。项们空 = 默认的本机项 */
const runReview = async (workLineTable: WorkLines, lines: VoiceLineRow[], o: { itemNames: string[]; describeOnly: boolean; allowPaid: boolean }) => {
  const infoList = await runVoicePy<ReviewItemInfo[]>('复核项', {});
  for (const itemName of o.itemNames) {
    const reviewItem = infoList.find((x) => x.name === itemName);
    if (!reviewItem) throw new UsageError(`没有复核项「${itemName}」，有：${infoList.map((x) => x.name).join('、')}`);
    if (reviewItem.付费 && !o.describeOnly && !o.allowPaid) throw new UsageError(`复核项 ${itemName} 按次收费、要把候选音频发到外部服务，确实要用加 --allow-paid（先 --dry-run 看要发什么）`);
  }
  const assetLock = readBothLocks();
  const reviewRequests: ReviewRequest[] = [];
  const reviewItems: { 行: VoiceLineRow; candidateFiles: string[]; compareFile?: string }[] = [];
  for (const line of lines) {
    const candidateFiles = listCandidates(candidateDir(dataRoot(), workName(), line.id));
    if (!candidateFiles.length) {
      console.log(`${line.id}：没有候选（先 anim voice gen ${line.id}）`);
      continue;
    }
    const compareFile = line.voice && assetLock[line.voice] ? finishedFile(line, assetLock) : undefined;
    // 没配音色参考的角色照样量起伏：音色项拿到空参考自己记「没给参考音频」，不让整句复核报错
    let refAudio = '';
    try {
      refAudio = timbreRef(workLineTable, line, assetLock, dataRoot()).file;
    } catch (e) {
      console.log(`${line.id}：${(e as Error).message}，音色项跳过`);
    }
    for (const wav of [...candidateFiles, ...(compareFile && fs.existsSync(compareFile) ? [compareFile] : [])]) {
      reviewRequests.push({ wav, id: line.id, spoken: spokenTextOf(line), language: line.language ?? '中文', tone: line.tone ?? '', 参考音频: refAudio });
    }
    reviewItems.push({ 行: line, candidateFiles, ...(compareFile && fs.existsSync(compareFile) ? { compareFile } : {}) });
  }
  if (!reviewRequests.length) return 0;
  // 音色要加载 Resemblyzer（torch，CPU）：和对齐一样过放行闸
  const runReview = () => runVoicePy<ReviewReply>('复核', { items: o.itemNames, 请求: reviewRequests, 只描述: o.describeOnly }, [reviewGroup]);
  const reply = o.describeOnly ? await runReview() : await passGate(runReview);
  if (o.describeOnly) {
    for (const [itemName, r] of Object.entries(reply)) {
      console.log(JSON.stringify(r.描述, null, 1));
      console.log(`dry-run：复核项 ${itemName}，${reviewRequests.length} 个 wav，没跑。${r.缺?.length ? `真跑前要补：${r.缺.join('；')}` : '这台机器上能跑'}`);
    }
    return 0;
  }
  const perWav = unpackReply(reviewRequests, reply);
  const time = new Date().toISOString();
  for (const { 行: line, candidateFiles, compareFile } of reviewItems) {
    const items: ReviewItem[] = candidateFiles.map((wav) => ({ name: path.basename(wav, '.wav'), wav, 复核: perWav.get(wav)! }));
    for (const t of items) writeCandidateNote(t.wav, t.复核);
    const reportPath = path.join(candidateDir(dataRoot(), workName(), line.id), '复核.md');
    fs.writeFileSync(reportPath, reviewReportText({ id: line.id, spoken: spokenTextOf(line), tone: line.tone ?? '', items, ...(compareFile ? { compareRow: { name: `现成品 ${line.voice}`, wav: compareFile, 复核: perWav.get(compareFile)! } } : {}), time: time }));
    console.log(`${line.id}：复核了 ${items.length} 个候选${compareFile ? '和现成品' : ''}，报告 ${reportPath}`);
    for (const t of items) console.log(`  ${t.name}  ${JSON.stringify(t.复核)}`);
  }
  return 0;
};

// ---------- gen / use ----------

const generate = async (workLineTable: WorkLines, lines: VoiceLineRow[], p: ReturnType<typeof parseArgs>, runRecord: Parameters<Command['跑']>[1]) => {
  const assetLock = readBothLocks();
  const flagNum = (valueKey: string) => {
    const v = p.value[valueKey];
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!v.trim() || !Number.isFinite(n)) throw new UsageError(`${valueKey} 要写数：${v}`);
    return n;
  };
  const seedList = p.value['--seeds']?.split(',').map((s) => s.trim());
  if (seedList?.some((s) => !/^\d+$/.test(s))) throw new UsageError(`--seeds 要写非负整数，逗号分开：${p.value['--seeds']}`);
  const strength = flagNum('--strength');
  const batches = buildSynthBatches(workLineTable, lines, {
    ...(p.value['--backend'] ? { backend: p.value['--backend'] } : {}),
    ...(seedList ? { seed: seedList.map(Number) } : {}),
    ...(p.value['--tone-ref'] ? { toneRef: path.resolve(p.value['--tone-ref']) } : {}),
    ...(strength !== undefined ? { intensity: strength } : {}),
  }, assetLock, { dataRoot: dataRoot(), work: workName() });
  if (p.toggles.has('--dry-run')) {
    for (const [backendName, { requests }] of batches) {
      const d = await runVoicePy<{ 缺: string[]; 描述: unknown[] }>('合成', { backend: backendName, 配置: backendConfig(workLineTable, backendName), 请求: requests, 只描述: true });
      for (const x of d.描述) console.log(JSON.stringify(x, null, 1));
      console.log(`dry-run：${backendName} ${requests.length} 个候选，没合成。${d.缺.length ? `真跑前要补：${d.缺.join('；')}` : '这台机器上能跑'}`);
    }
    return 0;
  }
  // 先把每个后端都核一遍（收费、云端、缺东西），都过了再开跑，免得跑了一半才停
  const toRun: { backendName: string; config: Record<string, unknown>; isLocal: boolean }[] = [];
  for (const backendName of batches.keys()) {
    const backendCfg = backendConfig(workLineTable, backendName);
    const backendInfo = (await runVoicePy<BackendInfo[]>('后端', { 配置: { [backendName]: backendCfg } })).find((b) => b.name === backendName);
    if (!backendInfo) throw new UsageError(`没有 TTS 后端「${backendName}」（anim voice backends 看有哪些）`);
    if (backendInfo.付费 && !p.toggles.has('--allow-paid')) throw new UsageError(`${backendName} 按次收费，确实要用加 --allow-paid（先 --dry-run 看请求）`);
    if (backendInfo.云端 && !p.toggles.has('--allow-cloud') && !p.toggles.has('--allow-paid')) throw new UsageError(`${backendName} 要把参考音频和台词发到外部服务，确实要用加 --allow-cloud`);
    if (backendInfo.缺.length) throw new Error(`${backendName} 在这台机器上跑不了：${backendInfo.缺.join('；')}`);
    toRun.push({ backendName, config: backendCfg, isLocal: backendInfo.本机 });
  }
  let bad = 0;
  for (const { backendName, config, isLocal } of toRun) {
    const { requests, notes } = batches.get(backendName)!;
    const runGen = () => runVoicePy<{ id: string; seed: number; output: string; 成功: boolean; note: string; params: Record<string, unknown> }[]>('合成', { backend: backendName, 配置: config, 请求: requests });
    // 本机模型吃 GPU 和十几 GB 统一内存，和渲染一样排队；云端的不占本机
    const results = isLocal ? await passRenderGate(runGen) : await runGen();
    for (const r of results) {
      const note = notes.get(r.output);
      if (r.成功 && note) fs.writeFileSync(r.output.replace(/\.wav$/i, '.json'), JSON.stringify({ ...note, params: r.params }, null, 1) + '\n');
      if (r.成功) runRecord.artifacts.push(r.output);
      else bad++;
      console.log(`${r.id} 种子 ${r.seed}（${backendName}）：${r.成功 ? r.output : '失败'}${r.note ? `（${r.note}）` : ''}`);
    }
  }
  if (runRecord.artifacts.length && !p.toggles.has('--no-review')) {
    // 复核只是辅助：没跑成（比如装不上 torch）不让 gen 算失败，候选照样能试听、use
    try {
      await runReview(workLineTable, lines, { itemNames: [], describeOnly: false, allowPaid: false });
    } catch (e) {
      if (e instanceof SchedYieldError) throw e;
      console.error(`复核没跑成（候选不受影响，可以之后 anim voice review）：${(e as Error).message}`);
    }
  }
  console.log(`候选在 ${candidateDir(dataRoot(), workName(), '<台词 id>')}；试听挑一个后 anim voice use <id> <候选.wav>`);
  return bad ? 1 : 0;
};

/** 资产表里没有这件就在作品资产表 <作品根>/资产表/配音.toml 末尾补一条（新配音只给这部作品用；私有） */
const ensureRegistered = (id: string, source: string, license: string, visibility: string) => {
  const { entryMap } = readAssetRegistryBoth(workRoot());
  if (entryMap.has(id)) return false;
  const f = path.join(workAssetRegistryDir(workRoot()), '配音.toml');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const headerText = fs.existsSync(f) ? '' : '# 作品资产表：配音成品和原件（anim voice use 补的条目，可手改 来源、许可、说明）。字段见 assets/README.md。\n';
  const lines = ['', '[["asset"]]', `id = ${JSON.stringify(id)}`, '"category" = "配音"', `"source" = ${JSON.stringify(source)}`, `"license" = ${JSON.stringify(license)}`, `"visibility" = ${JSON.stringify(visibility)}`, ''].join('\n');
  fs.appendFileSync(f, headerText + lines);
  return true;
};

const finalize = async (workLineTable: WorkLines, line: VoiceLineRow, candidatePath: string, p: ReturnType<typeof parseArgs>, runRecord: Parameters<Command['跑']>[1]) => {
  if (!fs.existsSync(candidatePath)) throw new UsageError(`没有 ${candidatePath}`);
  // 第 6、7 章的旧段还从两份整表（数据/配音/台词表、口型）取开口、时长、嘴，换了成品它们不跟着变：声音和嘴会对不上
  if (!p.toggles.has('--ignore-old') && [...oldLineRenames(workRoot()).values()].includes(line.id)) {
    throw new UsageError(`${line.id} 还被旧段的 台词轨.tsx、配音/口型.ts 经旧表（${oldTableAssets.lineTable}、${oldTableAssets.lip}）用着，换了成品旧段的开口、时长、嘴不跟着变；用到它的段改用句模块后再换，确实要换加 --ignore-old`);
  }
  const note = readCandidateNote(candidatePath);
  const sourceNote = note
    ? `手工:${note.backend} 克隆 ${line.character}（参考 ${note.reference}），种子 ${note.seed}${Object.keys(note.params).length ? `，${JSON.stringify(note.params)}` : ''}，anim voice gen 的候选里挑的`
    : `手工:${p.value['--source'] ?? '现成的配音（anim voice use 拿进来的）'}`;
  const finishedPath = path.join(candidateDir(dataRoot(), workName(), line.id), `成品-${path.basename(candidatePath)}`);
  const noTrim = p.toggles.has('--no-trim') || Boolean(line.synth?.noTrim);
  const m = await runVoicePy<Measure & { gainDb: number }>('成品', { 原件: candidatePath, finished: noTrim ? null : finishedPath, noTrim: noTrim, targetLoudness: workLineTable.voice.targetLoudness, peakCeilingDb: workLineTable.voice.peakCeilingDb });
  const originalId = `配音/原件/${line.id}`;
  const finishedId = line.voice ?? `配音/${line.id}`;
  for (const [id, sourceDesc] of [[originalId, sourceNote], [finishedId, `派生:${originalId}+anim voice use（裁静音、拉到 ${workLineTable.voice.targetLoudness} LUFS）`]] as const) {
    if (ensureRegistered(id, sourceDesc, workLineTable.voice.license, workLineTable.voice.visibility)) console.log(`资产表补了 ${id}（${relativeToCodeRoot(path.join(workAssetRegistryDir(workRoot()), '配音.toml'))}，${workLineTable.voice.visibility}）`);
  }
  const replace = p.toggles.has('--replace');
  registerAsset(originalId, candidatePath, { workRoot: workRoot(), replace });
  const { entry } = registerAsset(finishedId, noTrim ? candidatePath : finishedPath, { workRoot: workRoot(), replace });
  let toml = fs.readFileSync(linesFile(), 'utf8');
  toml = editLineField(toml, line.id, { voice: finishedId, mouthOpen: m.mouthOpen, textHash: voiceTextHash(line), finishedSha: entry.sha256.slice(0, 12) });
  fs.writeFileSync(linesFile(), toml);
  console.log(`${line.id}：成品 ${entry.sha256.slice(0, 12)}，开口 ${m.mouthOpen} 秒、有声 ${m.有声长} 秒、共 ${m.duration} 秒，增益 ${m.gainDb} dB`);
  const newTable = readTable();
  const written = await exportSentences([newTable.lines.find((t) => t.id === line.id)!], { newMeasures: new Map([[line.id, { mouthOpen: m.mouthOpen, 有声长: m.有声长, duration: m.duration }]]) });
  runRecord.artifacts.push(...written);
};

export const voiceCommands: Record<string, Command> = {
  voice: {
    usage: 'voice list [前缀…] | check [前缀…] | gen <id…> [--backend 名] [--seeds a,b] [--tone-ref wav] [--strength x] [--dry-run] [--allow-cloud] [--allow-paid] [--no-review] | review <id…> [--items 起伏,音色,听写,语气] [--dry-run] [--allow-paid] | use <id> <候选.wav> [--no-trim] [--replace] [--ignore-old] [--source 说明] | lip [前缀…] [--realign] | backends',
    note: '配音链：台词.toml 一句 → gen 出候选（run/草稿/配音/，顺带本机复核音色、起伏，见 复核.md；review 单独重跑）→ use 定稿（裁静音拉响度、登记私有资产、写回 台词.toml、出句模块 台词/<id>.ts）；lip 重出口型；check 核对配音、句模块、口型可复现',
    跑: async (args, runRecord) => {
      const [action, ...restArgs] = args;
      const p = parseArgs(restArgs, {
        toggles: ['--dry-run', '--allow-cloud', '--allow-paid', '--no-trim', '--replace', '--ignore-old', '--realign', '--no-review'],
        value: ['--backend', '--seeds', '--tone-ref', '--strength', '--source', '--items'],
      });
      if (action === 'backends') {
        const workLineTable = readWorkLines(linesFile());
        // Python 那边列出登记了的全部后端；这里只给有设置的那几个传设置
        const backendNames = new Set([...Object.keys(localSettings()), ...Object.keys(workLineTable?.voice.后端参数 ?? {})]);
        const backendInfos = await runVoicePy<BackendInfo[]>('后端', { 配置: Object.fromEntries([...backendNames].map((n) => [n, backendConfig(workLineTable, n)])) });
        for (const b of backendInfos) {
          const flagText = [b.本机 ? '本机' : '', b.云端 ? '云端' : '', b.付费 ? '付费' : ''].filter(Boolean).join('、');
          console.log(`${b.name}${workLineTable?.voice.backend === b.name ? '（本作品默认）' : ''}  [${flagText}]  ${b.note}\n    ${b.缺.length ? '缺：' + b.缺.join('；') : '能跑'}`);
        }
        return 0;
      }
      const workLineTable = readTable();
      if (action === 'list') {
        const assetLock = readBothLocks();
        let problemCount = 0;
        for (const line of selectLines(workLineTable, p.位置)) {
          const issues = sentenceIssues(line, assetLock, readSentenceModule(sentencePath(workRoot(), line.id)));
          if (issues.length) problemCount++;
          const status = !line.voice ? '没配音' : issues.length ? '要处理' : '齐';
          console.log(`${line.id}  ${status}  ${spokenTextOf(line).slice(0, 24)}${issues.map((x) => `\n    ${x}`).join('')}`);
        }
        console.log(`${selectLines(workLineTable, p.位置).length} 句，${problemCount} 句要处理`);
        return 0;
      }
      if (action === 'check') {
        const issues = await verifyLines(workLineTable, selectLines(workLineTable, p.位置, true));
        for (const x of issues) console.log(x);
        console.log(issues.length ? `${issues.length} 处不对` : `${selectLines(workLineTable, p.位置, true).length} 句的配音、句模块、口型都对得上`);
        return issues.length ? 1 : 0;
      }
      if (action === 'lip') {
        const written = await exportSentences(selectLines(workLineTable, p.位置, true), { realign: p.toggles.has('--realign') });
        runRecord.artifacts.push(...written);
        console.log(`写了 ${written.length} 个句模块（${relativeToCodeRoot(sentenceDir(workRoot()))}）`);
        return 0;
      }
      if (action === 'gen') {
        if (!p.位置.length) throw new UsageError('要给台词 id（或前缀）');
        return generate(workLineTable, selectLines(workLineTable, p.位置), p, runRecord);
      }
      if (action === 'review') {
        if (!p.位置.length) throw new UsageError('要给台词 id（或前缀）');
        const items = p.value['--items']?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
        return runReview(workLineTable, selectLines(workLineTable, p.位置), { itemNames: items, describeOnly: p.toggles.has('--dry-run'), allowPaid: p.toggles.has('--allow-paid') });
      }
      if (action === 'use') {
        const [id, candidatePath] = p.位置;
        if (!id || !candidatePath) throw new UsageError('要给 <台词 id> <候选.wav>');
        const line = workLineTable.lines.find((t) => t.id === id);
        if (!line) throw new UsageError(`台词.toml 里没有 ${id}`);
        await finalize(workLineTable, line, path.resolve(candidatePath), p, runRecord);
        return 0;
      }
      throw new UsageError(`voice 后面要跟 list、check、gen、review、use、lip 或 backends`);
    },
  },
};
