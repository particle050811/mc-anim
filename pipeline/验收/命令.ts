// anim verify [<选择器…>] [--渲] [--到预览 <主题>]：指纹和认可记录不一样的段抽帧比，超过阈值就要 accept。比的是切片（决策/0014：每段渲出来就是成片的一截，按输出帧）。
//   变了的帧、要看一眼的帧出 旧|新|差 的并排图进预览（没给 --到预览 就新开一个「验收」），附 00-说明.md。
//   认可记录的尺寸、帧数和现在的切片对不上（CRF1 时代的 1440p、按编排帧率的帧数）：报「这段没有现行认可，要重新认可」，算不过，不比。
// anim verify accept <段…> --理由 <…> [--渲]：把现在的切片记成认可版，写 <作品根>/认可/<平台>/<段键>.toml（进 Git）；一次可认可多段、共用一个理由，
//   但要逐段点名（一个选择器对上多段就拒，见 认可.ts 的 点名不唯一）。认可文件都写完再从这版的切片抽认可参考。
// anim verify 补参考 [<选择器…>]：从认可那版的切片抽出认可参考，之后认可那版删了也能比像素。
// anim verify 逐帧 <选择器…> [--帧 …] --存 <名> | --比 <名> [--留图 <目录>]：每帧 PNG 的 sha 存一份、再渲一次比，见 逐帧校验.ts。
// 一律按视频级比；真要抽帧解码时才过放行闸（一次命令只过一次；指纹和认可版一样的段不解码、不等闸，用户 10-30 授权），
// 缺切片加 --渲 时渲染照旧过渲染闸（和 anim film 同一条路，渲/渲段.ts）。指纹一样、但段签说同一指纹重渲过（签名和认可记录不一样，或切片大小改于和段签记的不一样）的照样比：
// 这时现在的切片不是认可那版，认可那版的像素只取认可参考，或段签证明是认可那版的切片，不拿现在的冒充。
// 新这一版的签名读段签（pipeline/段签/，缺了从切片当场派生），哈希和认可版不一样的帧解切片取像素（用户 11-02 定的比法：比小块平均颜色，压缩噪声在门槛以下）；
// 认可那版的像素按 认可参考 → 认可那版的切片 → 只比块均值 取。现在这个指纹的切片都没了、又要看像素，报要重渲。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { commitStatus } from '../环境/路径.ts';
import { loadAllSegments, matchSelector, selectSegs, type SegInfo } from '../清单/清单.ts';
import { markUsed } from '../渲/母版.ts';
import { masterDir } from '../环境/配置.ts';
import { masterSize } from '../渲/设置.ts';
import { segmentProducts, type SegArtifact } from '../渲/段产物.ts';
import { renderSegments } from '../渲/渲段.ts';
import { lazyPassGate } from '../闸/闸.ts';
import { newPreviewDir } from '../预览/预览.ts';
import { utcTime, type RunRecord } from '../运行记录/记录.ts';
import { readThresholds, conversion } from './比较.ts';
import { platformId, findAmbiguous, readApproval, writeApproval, approvalFile, type ApprovalRecord } from './认可.ts';
import { scanMaster, scanSegStamp, isChanged, NoSignatureError, MissingMasterError, RefMismatchError, type ScanResult } from './验收.ts';
import { prepareRef, referenceFile, findApprovedMaster, type ReferenceResult } from './参考.ts';
import { fetchSegStamp, sameFingerprintRerender } from '../段签/取.ts';
import { matchesMaster, readSegStamp, segStampComplete, type SegStamp } from '../段签/段签.ts';
import { isValidTopic } from '../预览/预览.ts';
import { checkSelectedSegCues, runCuesBeforeRender } from '../段框架/自动.ts';
import { parseFrames, runPerFrame } from './逐帧校验.ts';

const level = '视频' as const;

type Prepared = SegArtifact & { 有: boolean; hasSegStamp: boolean };

/** 每段现在的切片；缺的 --渲 就渲（和 anim film 同一条路），不渲就记下 */
const prepSlices = async (segments: SegInfo[], renderMissing: boolean, runRecord: RunRecord): Promise<Prepared[]> => {
  const allSegments = await loadAllSegments();
  const products = await segmentProducts(allSegments, segments, level);
  const hasOutputs = (r: SegArtifact) => fs.existsSync(r.画面) && fs.existsSync(r.声音);
  const missing = products.filter((r) => !hasOutputs(r));
  if (missing.length && renderMissing) await renderSegments(allSegments, missing.map((r) => r.段), level, { runRecord });
  return products.map((r) => {
    const present = hasOutputs(r);
    if (present) for (const fp of [r.画面指纹.指纹, r.声音指纹.指纹]) markUsed(masterDir(r.段.键), fp);
    return { ...r, 有: present, hasSegStamp: segStampComplete(readSegStamp(r.段.键, r.画面指纹.指纹)) };
  });
};

/** 段签记的那份切片（新这一版要看像素时解它）；不在或不是那份 null */
const segStampSlice = async (segStamp: SegStamp, r: SegArtifact): Promise<string | null> => (fs.existsSync(r.画面) && (await matchesMaster(segStamp, r.画面)) ? r.画面 : null);

/** 认可记录的尺寸、帧数和现在的切片对不上（CRF1 时代的 1440p、编排帧数）：不是现行认可，比不了 */
const approvalStaleReason = (approval: ApprovalRecord, outputFrames: number | null): string | null => {
  const [width, height] = masterSize(level);
  return approval.宽 !== width || approval.高 !== height || (outputFrames !== null && approval.帧数 !== outputFrames) ? `认可时是 ${approval.宽}×${approval.高} ${approval.帧数} 帧，现在的切片是 ${width}×${height}${outputFrames === null ? '' : ` ${outputFrames} 帧`}` : null;
};

/** 预览目录的 00-说明.md：这次 verify 出了哪些图、怎么看，末尾留「你的回复：」 */
const writePreviewNote = (previewDir: string, items: { 键: string; comparedWith: string; 帧: { 帧: number; 结论: string; 说明?: string }[] }[]) => {
  const lines = [
    `# anim verify 的并排图`,
    '',
    `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC。每张图上排是 旧 | 新 | 差×4（各通道差的最大值乘 4），红框是平均差最大的那块；下排是红框附近放大 6 倍。`,
    '文件名带「变了」的要看过、确认是要的改动再 `anim verify accept <段…> --理由 …`；带「看一眼」的没判失败（16×16 块平均差在看一眼的档里），只是给你看一眼。',
    '没有认可那版像素、只比了块均值的（下面标「块均值」），图只有现在这一张。',
    '',
    ...items.flatMap((x) => [`## ${x.键}（和${x.comparedWith}比）`, '', ...x.帧.map((f) => `- 第 ${f.帧} 帧：${f.结论}${f.说明 ? `，${f.说明}` : ''}`), '']),
    '你的回复：',
    '',
  ];
  fs.writeFileSync(path.join(previewDir, '00-说明.md'), lines.join('\n'), 'utf8');
};

const perFrameNote = '--存 每帧 PNG 的 sha 写到 run/逐帧校验/<作品>/<名>/<段键>.tsv（不给 --帧 是整段，不覆盖已有的）；--比 再渲一次、列出不同的帧，有不同退出码 1：照基准存的帧连着渲，给了 --帧 就渲到其中最后一帧为止（前面的帧不省，隔开渲比不了）。--留图 给空目录，在 --存 时留全部 PNG，在 --比 时只留不同的帧。不写母版，不碰段签和认可';

const verifyCmd: Command = {
  用法: 'verify [<选择器…>] [--渲] [--到预览 <主题>]；verify accept <段…> --理由 <…> [--渲]；verify 补参考 [<选择器…>]；verify 逐帧 <选择器…> [--帧 <a-b|帧,帧>] --存 <名>|--比 <名> [--留图 <目录>]',
  说明: `指纹变了的段抽帧和认可版比（比切片，按输出帧；--渲 先把缺的切片渲出来），超过阈值就要 anim verify accept；认可记录是旧档的（1440p、编排帧数）报要重新认可。逐帧：${perFrameNote}`,
  跑: async (args, runRecord) => {
    if (args[0] === 'accept') return acceptCmd.跑(args.slice(1), runRecord);
    if (args[0] === '补参考') return backfillRef.跑(args.slice(1), runRecord);
    if (args[0] === '逐帧') return perFrameCmd.跑(args.slice(1), runRecord);
    const p = parseArgs(args, { 值: ['--到预览'], toggles: ['--渲'] });
    const segments = p.位置.length ? await selectSegs(p.位置) : await loadAllSegments();
    const threshold = readThresholds();
    const slices = await prepSlices(segments, p.toggles.has('--渲'), runRecord);
    const previewOpts = { 目录: null as string | null };
    const getPreviewDir = () => (previewOpts.目录 ??= newPreviewDir(p.值['--到预览'] ?? '验收'));
    const previewItems: Parameters<typeof writePreviewNote>[1] = [];
    let failed = 0;
    let glanceCount = 0;
    const logReport = (segKey: string, comparedWith: string, r: ScanResult) => {
      const frameChanged = r.frameVerdicts.filter((f) => f.结论 === '变了');
      const glanceFrames = r.frameVerdicts.filter((f) => f.看一眼);
      const withinTol = r.frameVerdicts.filter((f) => f.结论 === '容差内').length;
      if (frameChanged.length || glanceFrames.length) previewItems.push({ 键: segKey, comparedWith: `${comparedWith}，${r.比法}`, 帧: [...frameChanged, ...glanceFrames].sort((a, b) => a.帧 - b.帧).map((f) => ({ 帧: f.帧, 结论: f.看一眼 ? '看一眼' : f.结论, 说明: f.说明 })) });
      if (glanceFrames.length) {
        glanceCount += glanceFrames.length;
        console.log(`· ${segKey}：${glanceFrames.map((f) => `第 ${f.帧} 帧`).join('、')} 块平均差在看一眼的档里（不算不过，并排图进预览）`);
      }
      if (!isChanged(r)) {
        console.log(`✓ ${segKey}：和${comparedWith}比在阈值内（${r.比法}${r.pixelSource ? `，像素取自${r.pixelSource}` : ''}；${withinTol} 帧有微小差别；声音${r.audioVerdict}${r.audioNote ? `，${r.audioNote}` : ''}）`);
        return;
      }
      failed++;
      const itemLines = [r.sizeChanged, ...frameChanged.slice(0, 8).map((f) => `第 ${f.帧} 帧：${f.说明 ?? '变了'}`), frameChanged.length > 8 ? `另 ${frameChanged.length - 8} 帧` : undefined, r.audioVerdict === '变了' ? `声音：${r.audioNote}` : undefined];
      runRecord.log('错误', `${segKey}：和${comparedWith}比变了（${r.比法}${r.pixelSource ? `，像素取自${r.pixelSource}` : ''}）\n    ${itemLines.filter(Boolean).join('\n    ')}`);
    };
    const waitGate = lazyPassGate();
    for (const x of slices) {
      const segKey = x.段.键;
      const approval = readApproval(approvalFile(segKey));
      if (approval?.conversion && approval.conversion !== conversion) console.log(`· ${segKey}：认可时比画面用的换算是「${approval.conversion}」，现在是「${conversion}」`);
      const fingerprint = x.画面指纹.指纹;
      if (!x.有 && !x.hasSegStamp) {
        failed++;
        runRecord.log('错误', `${segKey}：没有现在指纹 ${fingerprint.slice(0, 16)} 的切片和段签（anim film ${segKey}，或加 --渲）`);
        continue;
      }
      if (!approval) {
        failed++;
        runRecord.log('错误', `${segKey}：还没认可过（看过切片后 anim verify accept ${segKey} --理由 …）`);
        continue;
      }
      const legacyRecord = approvalStaleReason(approval, x.outputFrames);
      if (legacyRecord) {
        failed++;
        runRecord.log('错误', `${segKey}：这段没有现行认可，要重新认可（${legacyRecord}）：看过切片后 anim verify accept ${segKey} --理由 …`);
        continue;
      }
      const sameFingerprint = approval.指纹 === fingerprint;
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
      const oldMaster = fs.existsSync(refFile) ? null : ((await findApprovedMaster(approval))?.文件 ?? null);
      const options = { approval, oldMaster, 参考: refFile, 阈值: threshold, 预览: { 目录: getPreviewDir, filePrefix: segKey } };
      const segStamp = await fetchSegStamp(x, { waitGate, runRecord });
      if (!segStamp) {
        failed++;
        runRecord.log('错误', `${segKey}：没有段签、切片也没了：要重渲才能验收（anim film ${segKey} --重渲）`);
        continue;
      }
      if (segStamp.沿用) console.log(`· ${segKey}：现在的指纹是 anim 认指纹 沿用 ${segStamp.沿用.自.slice(0, 16)} 的切片，签名、声音都是那一版的；要拿新代码的整段比，先 anim --低优先 film ${segKey} --重渲`);
      const newMaster = await segStampSlice(segStamp, x);
      let r: ScanResult;
      try {
        try {
          r = await scanSegStamp({ 签名: segStamp.签名, 母版: newMaster }, options);
        } catch (e) {
          // 认可记录的抽样间隔和段签不一样：要的帧签名里没有，解切片重算（签名的哈希就对不上了，都比像素）
          if (!(e instanceof NoSignatureError)) throw e;
          if (!newMaster) throw new MissingMasterError(`${e.message}，可现在这个指纹的切片不在`);
          r = await scanMaster(newMaster, { ...options, 声音: x.声音 });
        }
      } catch (e) {
        if (!(e instanceof RefMismatchError) && !(e instanceof MissingMasterError)) throw e;
        failed++;
        runRecord.log('错误', `${segKey}：${e.message}${e instanceof MissingMasterError ? `：要重渲才能验收（anim film ${segKey} --重渲）` : ''}`);
        continue;
      }
      logReport(segKey, `认可版（${approval.指纹.slice(0, 16)}，${approval.认可于}）`, r);
    }
    if (previewOpts.目录) {
      writePreviewNote(previewOpts.目录, previewItems);
      runRecord.产物.push(previewOpts.目录);
      console.log(`变了、要看一眼的帧（旧|新|差 并排）在 ${previewOpts.目录}`);
    }
    if (glanceCount) console.log(`${glanceCount} 帧在看一眼的档里，不算不过`);
    console.log(failed ? `\n${failed} 段没过：缺切片的先渲；旧档的、变了的看过画面、确认是要的改动，再 anim verify accept <段…> --理由 …` : `\n${segments.length} 段都过了`);
    return failed ? 1 : 0;
  },
};

const acceptCmd: Command = {
  用法: 'verify accept <段…> --理由 <…> [--渲]',
  说明: '把现在的切片记成认可版（写 <作品根>/认可/<平台>/<段键>.toml）；一次可认可多段、共用一个理由，要逐段点名',
  跑: async (args, runRecord) => {
    const p = parseArgs(args, { 值: ['--理由'], toggles: ['--渲'] });
    if (!p.位置.length) throw new UsageError('要给段：anim verify accept <段…> --理由 …');
    const reason = p.值['--理由']?.trim();
    if (!reason) throw new UsageError('要写 --理由（这次画面为什么变、谁看过）');
    const segments = await selectSegs(p.位置);
    const ambiguous = findAmbiguous(p.位置, segments, matchSelector);
    if (ambiguous.length) {
      throw new UsageError(`认可要逐段点名：${ambiguous.map((y) => `「${y.selector}」对上了 ${y.段.length} 段`).join('、')}；都看过的话写 anim verify accept ${[...new Set(ambiguous.flatMap((y) => y.段))].join(' ')} --理由 …`);
    }
    const slices = await prepSlices(segments, p.toggles.has('--渲'), runRecord);
    // 先查齐再写：有一段缺切片就一段都不认可
    const missing = slices.filter((x) => !x.有);
    if (missing.length) throw new Error(`${missing.map((x) => `${x.段.键}（${x.画面指纹.指纹.slice(0, 16)}）`).join('、')} 没有现在指纹的切片：先 anim film ${missing.map((x) => x.段.键).join(' ')}，或加 --渲`);
    if (slices.length > 1) console.log(`== 认可 ${slices.length} 段：${slices.map((x) => x.段.键).join('、')}`);
    // 签名取自段签（和 扫母版 同一份；缺了从切片派生，要解码：整批过一次放行闸）
    const approvalPass = lazyPassGate();
    // 每段都签好了再写：中途哪段解码失败，一个认可文件都不改
    const segStamps = [];
    for (const x of slices) {
      const segStamp = await fetchSegStamp(x, { waitGate: approvalPass, runRecord });
      // 认可参考要从这版的切片抽（段签不存像素）：段签记的那份切片不在就不认可，免得以后只能比块均值
      if (!segStamp || !(await segStampSlice(segStamp, x))) throw new Error(`${x.段.键} 现在指纹的切片（${x.画面指纹.指纹.slice(0, 16)}）不在、或不是段签记的那份，认可参考抽不了：要重渲才能认可（anim film ${x.段.键} --重渲）`);
      segStamps.push(segStamp);
    }
    const signatures: ScanResult['签名'][] = segStamps.map((g) => g.签名);
    const commit = commitStatus();
    const written: string[] = [];
    for (const [i, x] of slices.entries()) {
      const file = approvalFile(x.段.键);
      const prevApproval = readApproval(file);
      const signature = signatures[i]!;
      writeApproval(file, {
        段: x.段.键,
        指纹: x.画面指纹.指纹,
        平台: platformId(),
        渲染级别: level,
        认可于: utcTime(),
        提交: commit ? `${commit.提交}${commit.有改动 ? '+未提交改动' : ''}` : '不在 git 里',
        理由: reason,
        上一版指纹: prevApproval?.指纹 ?? null,
        conversion,
        ...signature,
      });
      runRecord.产物.push(file);
      written.push(file);
      console.log(`已认可 ${x.段.键}（${x.画面指纹.指纹.slice(0, 16)}，${signature.帧.length} 帧签名）→ ${file}`);
    }
    // 认可文件都写完了再备认可参考（从这版的切片抽；旧的认可参考不删）：备不上只警告，不让认可只写一半
    for (const [i, x] of slices.entries()) {
      try {
        const approval = readApproval(written[i]!)!;
        await approvalPass();
        const refParamsResult = await prepareRef(approval, platformId());
        if (refParamsResult === '对不上' || refParamsResult === '没有来源') runRecord.log('警告', `${x.段.键} 的认可参考没备上（${refParamsResult}），这版的切片删了以后 verify 只能比块均值`);
        else if (refParamsResult !== '已有') runRecord.产物.push(referenceFile(approval, platformId()));
      } catch (e) {
        runRecord.log('警告', `${x.段.键} 已认可，认可参考没备上（${(e as Error).message.split('\n')[0]}）；之后 anim verify 补参考 ${x.段.键}`);
      }
    }
    console.log('记得把认可文件和这次的改动一起提交');
  },
};

const backfillRef: Command = {
  用法: 'verify 补参考 [<选择器…>]',
  说明: '给本平台的认可记录备认可参考（认可那版的抽样帧）：从段签证明是认可那版的切片抽，记下各帧 yuv sha 的旁记；不是现行认可的（尺寸和切片对不上）跳过；只新增文件',
  跑: async (args, runRecord) => {
    const p = parseArgs(args, {});
    const segments = p.位置.length ? await selectSegs(p.位置) : await loadAllSegments();
    const buckets: Record<ReferenceResult, string[]> = { 已有: [], 从切片: [], 对不上: [], 没有来源: [] };
    const waitGate = lazyPassGate();
    let noApproval = 0;
    let notCurrent = 0;
    for (const s of segments) {
      const approval = readApproval(approvalFile(s.键));
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
      buckets[r].push(s.键);
      if (r === '从切片') {
        runRecord.产物.push(refFile);
        console.log(`✓ ${s.键}：${r}（${approval.指纹.slice(0, 16)}）`);
      }
      if (r === '对不上') runRecord.log('警告', `${s.键}：认可那版的切片（${approval.指纹.slice(0, 16)}）抽出来帧数、尺寸和认可记录对不上，没收`);
      if (r === '没有来源') console.log(`· ${s.键}：认可那版（${approval.指纹.slice(0, 16)}）的切片不在，或段签证明不了现在的切片是认可那版（同一指纹重渲过），补不了（verify 只能比块均值）`);
    }
    console.log(
      `\n认可参考：新备 ${buckets.从切片.length}，已有 ${buckets.已有.length}，对不上 ${buckets.对不上.length}，没有来源 ${buckets.没有来源.length}${noApproval ? `；${noApproval} 段还没认可过` : ''}${notCurrent ? `；${notCurrent} 段没有现行认可（要重新认可）` : ''}`,
    );
    return buckets.对不上.length ? 1 : 0;
  },
};

const perFrameCmd: Command = {
  用法: 'verify 逐帧 <选择器…> [--帧 <a-b|帧,帧>] --存 <名>|--比 <名> [--留图 <目录>]',
  说明: perFrameNote,
  跑: async (args, runRecord) => {
    const p = parseArgs(args, { 值: ['--帧', '--存', '--比', '--留图'] });
    if (!p.位置.length) throw new UsageError('要给选择器（段键、段名、编号、场键、章）');
    const [saveName, compareName] = [p.值['--存'], p.值['--比']];
    if ((saveName === undefined) === (compareName === undefined)) throw new UsageError('--存 <名> 和 --比 <名> 要给一个，只给一个');
    const checkName = (saveName ?? compareName)!;
    if (!isValidTopic(checkName)) throw new UsageError(`名字「${checkName}」不能当文件夹名（不能有 <>:"/\\|?* 和控制字符，不以点或空格开头结尾）`);
    const frames = p.值['--帧'] ? parseFrames(p.值['--帧']) : null;
    const cues = await runCuesBeforeRender();
    const segments = await selectSegs(p.位置);
    checkSelectedSegCues(cues, segments);
    return runPerFrame(segments, { checkMode: saveName !== undefined ? '存' : '比', 名: checkName, 帧: frames, keepDir: p.值['--留图'] ?? null, runRecord });
  },
};

export const verifyCommands: Record<string, Command> = { verify: verifyCmd };
