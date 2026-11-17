// anim verify [<选择器…>] [--render] [--to-preview <主题>]：指纹和认可记录不一样的段抽帧比，超过阈值就要 accept。比的是切片（决策/0014：每段渲出来就是成片的一截，按输出帧）。
//   变了的帧、要看一眼的帧出 旧|新|差 的并排图进预览（没给 --to-preview 就新开一个「验收」），附 00-说明.md。
//   认可记录的尺寸、帧数和现在的切片对不上（CRF1 时代的 1440p、按编排帧率的帧数）：报「这段没有现行认可，要重新认可」，算不过，不比。
// anim verify accept <段…> --reason <…> [--render]：把现在的切片记成认可版，写 <作品根>/认可/<平台>/<段键>.toml（进 Git）；一次可认可多段、共用一个理由，
//   但要逐段点名（一个选择器对上多段就拒，见 认可.ts 的 点名不唯一）。认可文件都写完再从这版的切片抽认可参考。
// anim verify backfill [<选择器…>]：从认可那版的切片抽出认可参考，之后认可那版删了也能比像素。
// anim verify frames <选择器…> [--frames …] --save <名> [--no-images] | --compare <名> [--tolerance <级>] [--keep-images <目录>]：每帧 PNG 的 sha 存一份、再渲一次比、报差多少，见 逐帧校验.ts。
// 一律按视频级比；真要抽帧解码时才过放行闸（一次命令只过一次；指纹和认可版一样的段不解码、不等闸，用户 10-30 授权），
// 缺切片加 --render 时渲染照旧过渲染闸（和 anim film 同一条路，出片/渲段.ts）。指纹一样、但段签说同一指纹重渲过（签名和认可记录不一样，或切片大小改于和段签记的不一样）的照样比：
// 这时现在的切片不是认可那版，认可那版的像素只取认可参考，或段签证明是认可那版的切片，不拿现在的冒充。
// 新这一版的签名读段签（验收/段签.ts，缺了从切片当场派生），哈希和认可版不一样的帧解切片取像素（用户 11-02 定的比法：比小块平均颜色，压缩噪声在门槛以下）；
// 认可那版的像素按 认可参考 → 认可那版的切片 → 只比块均值 取。现在这个指纹的切片都没了、又要看像素，报要重渲。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { commitStatus } from '../环境/路径.ts';
import { loadAllSegments, matchSelector, selectSegs, type SegInfo } from '../清单/清单.ts';
import { markUsed } from '../渲/母版.ts';
import { masterDir } from '../环境/作品数据.ts';
import { masterSize } from '../渲/设置.ts';
import { segmentProducts, type SegArtifact } from '../渲/段产物.ts';
import { renderSegments } from '../出片/渲段.ts';
import { lazyPassGate } from '../闸/闸.ts';
import { newPreviewDir } from '../预览/预览.ts';
import { utcTime, type RunRecord } from '../运行记录/记录.ts';
import { readThresholds, conversion } from './比较.ts';
import { platformId, findAmbiguous, readApproval, writeApproval, approvalFile, type ApprovalRecord } from './认可.ts';
import { scanMaster, scanSegStamp, isChanged, NoSignatureError, MissingMasterError, RefMismatchError, type ScanResult } from './验收.ts';
import { prepareRef, referenceFile, findApprovedMaster, type ReferenceResult } from './参考.ts';
import { fetchSegStamp, sameFingerprintRerender } from './取段签.ts';
import { matchesMaster, readSegStamp, segStampComplete, type SegStamp } from './段签.ts';
import { isValidTopic } from '../预览/预览.ts';
import { checkSelectedSegCues, runCuesBeforeRender } from '../段框架/自动.ts';
import { parseFrames, runPerFrame } from './逐帧校验.ts';
import { planDiff, type SegFrame } from './对比配对.ts';
import { runDiff } from './对比报告.ts';

const level = '视频' as const;

type Prepared = SegArtifact & { 有: boolean; hasSegStamp: boolean };

/** 每段现在的切片；缺的 --render 就渲（和 anim film 同一条路），不渲就记下 */
const prepSlices = async (segments: SegInfo[], renderMissing: boolean, runRecord: RunRecord): Promise<Prepared[]> => {
  const allSegments = await loadAllSegments();
  const products = await segmentProducts(allSegments, segments, level);
  const hasOutputs = (r: SegArtifact) => fs.existsSync(r.画面) && fs.existsSync(r.sound);
  const missing = products.filter((r) => !hasOutputs(r));
  if (missing.length && renderMissing) await renderSegments(allSegments, missing.map((r) => r.segment), level, { runRecord });
  return products.map((r) => {
    const present = hasOutputs(r);
    if (present) for (const fp of [r.pictureFingerprint.fingerprint, r.soundFingerprint.fingerprint]) markUsed(masterDir(r.segment.key), fp);
    return { ...r, 有: present, hasSegStamp: segStampComplete(readSegStamp(r.segment.key, r.pictureFingerprint.fingerprint)) };
  });
};

/** 段签记的那份切片（新这一版要看像素时解它）；不在或不是那份 null */
const segStampSlice = async (segStamp: SegStamp, r: SegArtifact): Promise<string | null> => (fs.existsSync(r.画面) && (await matchesMaster(segStamp, r.画面)) ? r.画面 : null);

/** 认可记录的尺寸、帧数和现在的切片对不上（CRF1 时代的 1440p、编排帧数）：不是现行认可，比不了 */
const approvalStaleReason = (approval: ApprovalRecord, outputFrames: number | null): string | null => {
  const [width, height] = masterSize(level);
  return approval.width !== width || approval.height !== height || (outputFrames !== null && approval.frameCount !== outputFrames) ? `认可时是 ${approval.width}×${approval.height} ${approval.frameCount} 帧，现在的切片是 ${width}×${height}${outputFrames === null ? '' : ` ${outputFrames} 帧`}` : null;
};

/** 预览目录的 00-说明.md：这次 verify 出了哪些图、怎么看，末尾留「你的回复：」 */
const writePreviewNote = (previewDir: string, items: { key: string; comparedWith: string; frame: { frame: number; verdict: string; note?: string }[] }[]) => {
  const lines = [
    `# anim verify 的并排图`,
    '',
    `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC。每张图上排是 旧 | 新 | 差×4（各通道差的最大值乘 4），红框是平均差最大的那块；下排是红框附近放大 6 倍。`,
    '文件名带「变了」的要看过、确认是要的改动再 `anim verify accept <段…> --reason …`；带「看一眼」的没判失败（16×16 块平均差在看一眼的档里），只是给你看一眼。',
    '没有认可那版像素、只比了块均值的（下面标「块均值」），图只有现在这一张。',
    '',
    ...items.flatMap((x) => [`## ${x.key}（和${x.comparedWith}比）`, '', ...x.frame.map((f) => `- 第 ${f.frame} 帧：${f.verdict}${f.note ? `，${f.note}` : ''}`), '']),
    '你的回复：',
    '',
  ];
  fs.writeFileSync(path.join(previewDir, '00-说明.md'), lines.join('\n'), 'utf8');
};

const perFrameNote = '只用来查同一份代码走不同路径（单帧、跳帧、连出、重渲）出的图是否一致，预期差是 0；比两份代码、两组参数出的图用 anim diff。--save 每帧 PNG 的 sha 写到 run/逐帧校验/<作品>/<名>/<段键>.tsv（不给 --frames 是整段，不覆盖已有的），PNG 留在旁边的 <段键>/（--no-images 不留，比的时候就报不了差多少）；--compare 再渲一次、列出不同的帧，每帧报差像素占比（任一通道差 >0、>8、>32）、最大差、块平均差（和 anim reuse 同一套），结尾列最差的几帧；有不同退出码 1，--tolerance <级> 把最大差不超过它的帧算过（默认不给，逐字节）。照基准存的帧连着渲，给了 --frames 就渲到其中最后一帧为止（前面的帧不省，隔开渲比不了）。--keep-images 给空目录，在 --save 时 PNG 留在那里，在 --compare 时只留不同的帧。不写母版，不碰段签和认可';

const verifyCmd: Command = {
  usage: 'verify [<选择器…>] [--render] [--to-preview <主题>]；verify accept <段…> --reason <…> [--render]；verify backfill [<选择器…>]；verify frames <选择器…> [--frames <a-b|帧,帧>] --save <名> [--no-images]|--compare <名> [--tolerance <级>] [--keep-images <目录>]',
  note: `指纹变了的段抽帧和认可版比（比切片，按输出帧；--render 先把缺的切片渲出来），超过阈值就要 anim verify accept；认可记录是旧档的（1440p、编排帧数）报要重新认可。frames：${perFrameNote}`,
  跑: async (args, runRecord) => {
    if (args[0] === 'accept') return acceptCmd.跑(args.slice(1), runRecord);
    if (args[0] === 'backfill') return backfillRef.跑(args.slice(1), runRecord);
    if (args[0] === 'frames') return perFrameCmd.跑(args.slice(1), runRecord);
    const p = parseArgs(args, { value: ['--to-preview'], toggles: ['--render'] });
    const segments = p.位置.length ? await selectSegs(p.位置) : await loadAllSegments();
    const threshold = readThresholds();
    const slices = await prepSlices(segments, p.toggles.has('--render'), runRecord);
    const previewOpts = { 目录: null as string | null };
    const getPreviewDir = () => (previewOpts.目录 ??= newPreviewDir(p.value['--to-preview'] ?? '验收'));
    const previewItems: Parameters<typeof writePreviewNote>[1] = [];
    let failed = 0;
    let glanceCount = 0;
    const logReport = (segKey: string, comparedWith: string, r: ScanResult) => {
      const frameChanged = r.frameVerdicts.filter((f) => f.verdict === '变了');
      const glanceFrames = r.frameVerdicts.filter((f) => f.看一眼);
      const withinTol = r.frameVerdicts.filter((f) => f.verdict === '容差内').length;
      if (frameChanged.length || glanceFrames.length) previewItems.push({ key: segKey, comparedWith: `${comparedWith}，${r.compareMethod}`, frame: [...frameChanged, ...glanceFrames].sort((a, b) => a.frame - b.frame).map((f) => ({ frame: f.frame, verdict: f.看一眼 ? '看一眼' : f.verdict, note: f.note })) });
      if (glanceFrames.length) {
        glanceCount += glanceFrames.length;
        console.log(`· ${segKey}：${glanceFrames.map((f) => `第 ${f.frame} 帧`).join('、')} 块平均差在看一眼的档里（不算不过，并排图进预览）`);
      }
      if (!isChanged(r)) {
        console.log(`✓ ${segKey}：和${comparedWith}比在阈值内（${r.compareMethod}${r.pixelSource ? `，像素取自${r.pixelSource}` : ''}；${withinTol} 帧有微小差别；声音${r.audioVerdict}${r.audioNote ? `，${r.audioNote}` : ''}）`);
        return;
      }
      failed++;
      const itemLines = [r.sizeChanged, ...frameChanged.slice(0, 8).map((f) => `第 ${f.frame} 帧：${f.note ?? '变了'}`), frameChanged.length > 8 ? `另 ${frameChanged.length - 8} 帧` : undefined, r.audioVerdict === '变了' ? `声音：${r.audioNote}` : undefined];
      runRecord.log('错误', `${segKey}：和${comparedWith}比变了（${r.compareMethod}${r.pixelSource ? `，像素取自${r.pixelSource}` : ''}）\n    ${itemLines.filter(Boolean).join('\n    ')}`);
    };
    const waitGate = lazyPassGate();
    for (const x of slices) {
      const segKey = x.segment.key;
      const approval = readApproval(approvalFile(segKey));
      if (approval?.conversion && approval.conversion !== conversion) console.log(`· ${segKey}：认可时比画面用的换算是「${approval.conversion}」，现在是「${conversion}」`);
      const fingerprint = x.pictureFingerprint.fingerprint;
      if (!x.有 && !x.hasSegStamp) {
        failed++;
        runRecord.log('错误', `${segKey}：没有现在指纹 ${fingerprint.slice(0, 16)} 的切片和段签（anim film ${segKey}，或加 --render）`);
        continue;
      }
      if (!approval) {
        failed++;
        runRecord.log('错误', `${segKey}：还没认可过（看过切片后 anim verify accept ${segKey} --reason …）`);
        continue;
      }
      const legacyRecord = approvalStaleReason(approval, x.outputFrames);
      if (legacyRecord) {
        failed++;
        runRecord.log('错误', `${segKey}：这段没有现行认可，要重新认可（${legacyRecord}）：看过切片后 anim verify accept ${segKey} --reason …`);
        continue;
      }
      const sameFingerprint = approval.fingerprint === fingerprint;
      if (sameFingerprint) {
        const reason = sameFingerprintRerender(readSegStamp(segKey, fingerprint), approval, x.画面);
        if (!reason) {
          console.log(`✓ ${segKey}：指纹和认可版一样`);
          continue;
        }
        console.log(`· ${segKey}：指纹和认可版一样，但同一指纹重渲过（${reason}），比一次`);
      }
      await waitGate();
      const refFile = referenceFile(approval, platformId());
      // 参考缺了先备（同指纹重渲过的，找认可母版 认不出现在的切片是认可那版，备不上）；备不上就退回认可那版的切片、块均值
      if (!fs.existsSync(refFile)) await prepareRef(approval, platformId()).catch((e: Error) => runRecord.log('警告', `${segKey} 的认可参考没备上（${e.message.split('\n')[0]}）`));
      const oldMaster = fs.existsSync(refFile) ? null : ((await findApprovedMaster(approval))?.file ?? null);
      const options = { approval, oldMaster, reference: refFile, threshold: threshold, 预览: { 目录: getPreviewDir, filePrefix: segKey } };
      const segStamp = await fetchSegStamp(x, { waitGate, runRecord });
      if (!segStamp) {
        failed++;
        runRecord.log('错误', `${segKey}：没有段签、切片也没了：要重渲才能验收（anim film ${segKey} --rerender）`);
        continue;
      }
      if (segStamp.reuse) console.log(`· ${segKey}：现在的指纹是 anim reuse 沿用 ${segStamp.reuse.reusedFrom.slice(0, 16)} 的切片，签名、声音都是那一版的；要拿新代码的整段比，先 anim --low-priority film ${segKey} --rerender`);
      const newMaster = await segStampSlice(segStamp, x);
      let r: ScanResult;
      try {
        try {
          r = await scanSegStamp({ signature: segStamp.signature, master: newMaster }, options);
        } catch (e) {
          // 认可记录的抽样间隔和段签不一样：要的帧签名里没有，解切片重算（签名的哈希就对不上了，都比像素）
          if (!(e instanceof NoSignatureError)) throw e;
          if (!newMaster) throw new MissingMasterError(`${e.message}，可现在这个指纹的切片不在`);
          r = await scanMaster(newMaster, { ...options, sound: x.sound });
        }
      } catch (e) {
        if (!(e instanceof RefMismatchError) && !(e instanceof MissingMasterError)) throw e;
        failed++;
        runRecord.log('错误', `${segKey}：${e.message}${e instanceof MissingMasterError ? `：要重渲才能验收（anim film ${segKey} --rerender）` : ''}`);
        continue;
      }
      logReport(segKey, `认可版（${approval.fingerprint.slice(0, 16)}，${approval.approvedAt}）`, r);
    }
    if (previewOpts.目录) {
      writePreviewNote(previewOpts.目录, previewItems);
      runRecord.artifacts.push(previewOpts.目录);
      console.log(`变了、要看一眼的帧（旧|新|差 并排）在 ${previewOpts.目录}`);
    }
    if (glanceCount) console.log(`${glanceCount} 帧在看一眼的档里，不算不过`);
    console.log(failed ? `\n${failed} 段没过：缺切片的先渲；旧档的、变了的看过画面、确认是要的改动，再 anim verify accept <段…> --reason …` : `\n${segments.length} 段都过了`);
    return failed ? 1 : 0;
  },
};

const acceptCmd: Command = {
  usage: 'verify accept <段…> --reason <…> [--render]',
  note: '把现在的切片记成认可版（写 <作品根>/认可/<平台>/<段键>.toml）；一次可认可多段、共用一个理由，要逐段点名',
  跑: async (args, runRecord) => {
    const p = parseArgs(args, { value: ['--reason'], toggles: ['--render'] });
    if (!p.位置.length) throw new UsageError('要给段：anim verify accept <段…> --reason …');
    const reason = p.value['--reason']?.trim();
    if (!reason) throw new UsageError('要写 --reason（这次画面为什么变、谁看过）');
    const segments = await selectSegs(p.位置);
    const ambiguous = findAmbiguous(p.位置, segments, matchSelector);
    if (ambiguous.length) {
      throw new UsageError(`认可要逐段点名：${ambiguous.map((y) => `「${y.selector}」对上了 ${y.segment.length} 段`).join('、')}；都看过的话写 anim verify accept ${[...new Set(ambiguous.flatMap((y) => y.segment))].join(' ')} --reason …`);
    }
    const slices = await prepSlices(segments, p.toggles.has('--render'), runRecord);
    // 先查齐再写：有一段缺切片就一段都不认可
    const missing = slices.filter((x) => !x.有);
    if (missing.length) throw new Error(`${missing.map((x) => `${x.segment.key}（${x.pictureFingerprint.fingerprint.slice(0, 16)}）`).join('、')} 没有现在指纹的切片：先 anim film ${missing.map((x) => x.segment.key).join(' ')}，或加 --render`);
    if (slices.length > 1) console.log(`== 认可 ${slices.length} 段：${slices.map((x) => x.segment.key).join('、')}`);
    // 签名取自段签（和 扫母版 同一份；缺了从切片派生，要解码：整批过一次放行闸）
    const approvalPass = lazyPassGate();
    // 每段都签好了再写：中途哪段解码失败，一个认可文件都不改
    const segStamps = [];
    for (const x of slices) {
      const segStamp = await fetchSegStamp(x, { waitGate: approvalPass, runRecord });
      // 认可参考要从这版的切片抽（段签不存像素）：段签记的那份切片不在就不认可，免得以后只能比块均值
      if (!segStamp || !(await segStampSlice(segStamp, x))) throw new Error(`${x.segment.key} 现在指纹的切片（${x.pictureFingerprint.fingerprint.slice(0, 16)}）不在、或不是段签记的那份，认可参考抽不了：要重渲才能认可（anim film ${x.segment.key} --rerender）`);
      segStamps.push(segStamp);
    }
    const signatures: ScanResult['signature'][] = segStamps.map((g) => g.signature);
    const commit = commitStatus();
    const written: string[] = [];
    for (const [i, x] of slices.entries()) {
      const file = approvalFile(x.segment.key);
      const prevApproval = readApproval(file);
      const signature = signatures[i]!;
      writeApproval(file, {
        segment: x.segment.key,
        fingerprint: x.pictureFingerprint.fingerprint,
        platform: platformId(),
        renderLevel: level,
        approvedAt: utcTime(),
        commit: commit ? `${commit.commit}${commit.dirty ? '+未提交改动' : ''}` : '不在 git 里',
        reason: reason,
        prevFingerprint: prevApproval?.fingerprint ?? null,
        conversion,
        ...signature,
      });
      runRecord.artifacts.push(file);
      written.push(file);
      console.log(`已认可 ${x.segment.key}（${x.pictureFingerprint.fingerprint.slice(0, 16)}，${signature.frame.length} 帧签名）→ ${file}`);
    }
    // 认可文件都写完了再备认可参考（从这版的切片抽；旧的认可参考不删）：备不上只警告，不让认可只写一半
    for (const [i, x] of slices.entries()) {
      try {
        const approval = readApproval(written[i]!)!;
        await approvalPass();
        const refParamsResult = await prepareRef(approval, platformId());
        if (refParamsResult === '对不上' || refParamsResult === '没有来源') runRecord.log('警告', `${x.segment.key} 的认可参考没备上（${refParamsResult}），这版的切片删了以后 verify 只能比块均值`);
        else if (refParamsResult !== '已有') runRecord.artifacts.push(referenceFile(approval, platformId()));
      } catch (e) {
        runRecord.log('警告', `${x.segment.key} 已认可，认可参考没备上（${(e as Error).message.split('\n')[0]}）；之后 anim verify backfill ${x.segment.key}`);
      }
    }
    console.log('记得把认可文件和这次的改动一起提交');
  },
};

const backfillRef: Command = {
  usage: 'verify backfill [<选择器…>]',
  note: '给本平台的认可记录备认可参考（认可那版的抽样帧）：从段签证明是认可那版的切片抽，记下各帧 yuv sha 的旁记；不是现行认可的（尺寸和切片对不上）跳过；只新增文件',
  跑: async (args, runRecord) => {
    const p = parseArgs(args, {});
    const segments = p.位置.length ? await selectSegs(p.位置) : await loadAllSegments();
    const buckets: Record<ReferenceResult, string[]> = { 已有: [], 从切片: [], 对不上: [], 没有来源: [] };
    const waitGate = lazyPassGate();
    let noApproval = 0;
    let notCurrent = 0;
    for (const s of segments) {
      const approval = readApproval(approvalFile(s.key));
      if (!approval) {
        noApproval++;
        continue;
      }
      if (approvalStaleReason(approval, null)) {
        notCurrent++;
        continue;
      }
      const refFile = referenceFile(approval, platformId());
      if (!fs.existsSync(refFile)) await waitGate();
      const r = await prepareRef(approval, platformId());
      buckets[r].push(s.key);
      if (r === '从切片') {
        runRecord.artifacts.push(refFile);
        console.log(`✓ ${s.key}：${r}（${approval.fingerprint.slice(0, 16)}）`);
      }
      if (r === '对不上') runRecord.log('警告', `${s.key}：认可那版的切片（${approval.fingerprint.slice(0, 16)}）抽出来帧数、尺寸和认可记录对不上，没收`);
      if (r === '没有来源') console.log(`· ${s.key}：认可那版（${approval.fingerprint.slice(0, 16)}）的切片不在，或段签证明不了现在的切片是认可那版（同一指纹重渲过），补不了（verify 只能比块均值）`);
    }
    console.log(
      `\n认可参考：新备 ${buckets.从切片.length}，已有 ${buckets.已有.length}，对不上 ${buckets.对不上.length}，没有来源 ${buckets.没有来源.length}${noApproval ? `；${noApproval} 段还没认可过` : ''}${notCurrent ? `；${notCurrent} 段没有现行认可（要重新认可）` : ''}`,
    );
    return buckets.对不上.length ? 1 : 0;
  },
};

const perFrameCmd: Command = {
  usage: 'verify frames <选择器…> [--frames <a-b|帧,帧>] --save <名> [--no-images]|--compare <名> [--tolerance <级>] [--keep-images <目录>]',
  note: perFrameNote,
  跑: async (args, runRecord) => {
    const p = parseArgs(args, { value: ['--frames', '--save', '--compare', '--keep-images', '--tolerance'], toggles: ['--no-images'] });
    if (!p.位置.length) throw new UsageError('要给选择器（段键、段名、编号、场键、章）');
    const [saveName, compareName] = [p.value['--save'], p.value['--compare']];
    if ((saveName === undefined) === (compareName === undefined)) throw new UsageError('--save <名> 和 --compare <名> 要给一个，只给一个');
    const checkName = (saveName ?? compareName)!;
    if (!isValidTopic(checkName)) throw new UsageError(`名字「${checkName}」不能当文件夹名（不能有 <>:"/\\|?* 和控制字符，不以点或空格开头结尾）`);
    const frames = p.value['--frames'] ? parseFrames(p.value['--frames']) : null;
    if (p.toggles.has('--no-images') && saveName === undefined) throw new UsageError('--no-images 只跟 --save：比的时候本来只留不同的帧');
    const toleranceText = p.value['--tolerance'];
    if (toleranceText !== undefined && (compareName === undefined || !/^\d+$/.test(toleranceText) || Number(toleranceText) > 255)) throw new UsageError(`--tolerance 只跟 --compare，写 0～255 的整数级（任一通道的最大差）：${toleranceText}`);
    const cues = await runCuesBeforeRender();
    const segments = await selectSegs(p.位置);
    checkSelectedSegCues(cues, segments);
    return runPerFrame(segments, { checkMode: saveName !== undefined ? '存' : '比', name: checkName, frame: frames, keepDir: p.value['--keep-images'] ?? null, noImages: p.toggles.has('--no-images'), tolerance: toleranceText === undefined ? null : Number(toleranceText), runRecord });
  },
};

/** 正整数参数；没给返回 undefined */
const positiveInt = (v: string | undefined, flag: string, min = 1) => {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v) || Number(v) < min) throw new UsageError(`${flag} 要是不小于 ${min} 的整数：${v}`);
  return Number(v);
};

/** --offset：整数，可以是负的 */
const parseOffset = (v: string | undefined) => {
  if (v === undefined) return undefined;
  if (!/^[+-]?\d+$/.test(v)) throw new UsageError(`--offset 要是整数：${v}`);
  return Number(v);
};

/** --seg <段键>[@<视频第 0 帧是段内第几帧>] */
const parseSegArg = (v: string | undefined): SegFrame | null => {
  if (v === undefined) return null;
  const m = /^(.+?)(?:@(\d+))?$/.exec(v)!;
  return { segKey: m[1]!, frame: Number(m[2] ?? 0) };
};

export const diffNote =
  '改前改后对比：A 是旧、B 是新，差 = B − A。A、B 是两个静帧目录（同名配对，名字不同的按「第N帧」或最后一串数字配）、两张 PNG，或两个视频（按帧号对齐抽帧：--frames a-b|帧,帧，--every n，默认每秒一帧含首尾；两条起点差几帧用 --offset k，A 的第 n+k 帧对 B 的第 n 帧；yuv420p 按 verify 的固定公式换 RGB）。' +
  '每对出 旧｜新｜差 并排图（差图带符号：红亮了、蓝暗了、绿亮度差不多但颜色变了；--gain 放大倍数默认 8，--panel-width 每格宽默认 1920），只出最差的 --images 张（默认 24）；' +
  '算块平均差（和 verify、reuse 同一个 computeBlockDiff，门槛和分档读 verify/阈值.toml）、各档超门槛的块数、差像素占比、最大差；挑差得最多的 --windows 个窗口（默认 5）在图上框出，打印能直接复制的 anim still <段> <帧> --tele <x,y,宽> 原生复查（--zoom 望远倍数默认 8；视频旁有 anim film 的 manifest.json 就照它定段和帧，否则 --seg <段键>[@起帧]）。' +
  '汇总写进 00-说明.md、打到终端；出到 --to-preview <主题>（预览/，「工作-」开头进 run/草稿/）或 --out <新目录>，都不给是 run/草稿/<UTC>-工作-对比/。有一对判「变了」退出码 1。' +
  '和 verify frames --compare 的分工：那边比同一份代码走不同路径（预期逐字节一样），这里比两份代码或两组参数（预期有差，要知道差在哪、差多少）。省事写法：anim still <段> <帧…> --to-preview <主题> --vs <检出|分支|main>';

const diffCmd: Command = {
  usage: 'diff <A（旧）> <B（新）> [--to-preview <主题>|--out <目录>] [--frames <a-b|帧,帧>] [--every <n>] [--offset <±n>] [--seg <段键>[@<起帧>]] [--windows <n>] [--zoom <倍>] [--images <n>] [--gain <n>] [--panel-width <像素>]',
  note: diffNote,
  跑: async (args, runRecord) => {
    const p = parseArgs(args, { value: ['--to-preview', '--out', '--frames', '--every', '--offset', '--seg', '--windows', '--zoom', '--images', '--gain', '--panel-width'] });
    if (p.位置.length !== 2) throw new UsageError('要给 A（旧）和 B（新）两个：目录、PNG 或视频');
    if (p.value['--to-preview'] && p.value['--out']) throw new UsageError('--to-preview 和 --out 只给一个');
    const [a, b] = p.位置.map((x) => path.resolve(x)) as [string, string];
    let plan;
    try {
      plan = planDiff(a, b, { frames: p.value['--frames'] ? parseFrames(p.value['--frames']) : undefined, every: positiveInt(p.value['--every'], '--every'), seg: parseSegArg(p.value['--seg']), offset: parseOffset(p.value['--offset']) });
    } catch (e) {
      if (e instanceof UsageError) throw e;
      throw new UsageError((e as Error).message);
    }
    if (!plan.pairs.length) throw new Error(`A、B 里没有配得上的图（只在 A ${plan.onlyA.length} 个，只在 B ${plan.onlyB.length} 个）`);
    const outDir = resolveDiffOut(p.value['--to-preview'], p.value['--out']);
    const { code } = await runDiff(plan, {
      outDir, threshold: readThresholds(), aName: path.basename(a), bName: path.basename(b),
      hotspots: positiveInt(p.value['--windows'], '--windows', 0), zoom: positiveInt(p.value['--zoom'], '--zoom'), maxImages: positiveInt(p.value['--images'], '--images', 0),
      gain: positiveInt(p.value['--gain'], '--gain'), panelWidth: positiveInt(p.value['--panel-width'], '--panel-width', 16),
    });
    runRecord.artifacts.push(outDir);
    return code;
  },
};

/** --out 要是新目录或空目录（不覆盖旧的）；都没给出到草稿 */
export const resolveDiffOut = (topic: string | undefined, out: string | undefined) => {
  if (!out) return newPreviewDir(topic ?? '工作-对比');
  const dir = path.resolve(out);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new UsageError(`--out ${dir} 已经有东西了，换一个新目录（不覆盖旧的）`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const verifyCommands: Record<string, Command> = { verify: verifyCmd, diff: diffCmd };
