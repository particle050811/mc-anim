// anim 批：复用准备好的包；任务一行 <包键> <段> <帧串> <名> [留=全|帧,帧]。
// 每项新浏览器是为了核对加载历史；显式 --保留浏览器 才跨项复用。PKGS 是包键到本地包目录的 JSON。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareBrowser } from './浏览器.ts';
import { getCompositions, openBrowser, renderFrames } from './渲染器.ts';
import { openGateBatch, gateHeartbeat } from '../闸/闸.ts';
import { parseArgs, UsageError } from '../cli/参数.ts';
import type { Command } from '../cli/命令.ts';
import { renderParams, frameTimeoutMs } from './设置.ts';
import { selectSegs } from '../清单/清单.ts';
import { segRenderEnv, segTerrainNow } from './地形注入.ts';
export const runBatch = async (args: string[]) => {
    const p = parseArgs(args, { toggles: ['--保留浏览器'], 值: ['--连贯'] });
    const [taskFile, outPath] = p.位置;
    if (!taskFile || !outPath || !process.env.PKGS)
        throw new UsageError('批 需要任务文件、输出目录和 PKGS 包表');
    fs.mkdirSync(outPath!, { recursive: true });
    const packPaths = JSON.parse(process.env.PKGS!) as Record<string, string>;
    const tasks = fs.readFileSync(taskFile!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
        const [pack, segKey, frameRange, outName, keepFrames] = l.split(/\s+/);
        return { 包: pack!, 段: segKey!, frameRange: frameRange!, 名: outName!, 留: keepFrames?.replace(/^留=/, '') ?? '' };
    });
    const parseFrames = (rangeText: string) => rangeText.split(',').flatMap((x) => { const m = /^(\d+)-(\d+)$/.exec(x); return m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i) : [Number(x)]; });
    for (const t of tasks) {
        if (!t.名 || /[\\/]/.test(t.名) || !packPaths[t.包] || !t.frameRange || parseFrames(t.frameRange).some(x => !Number.isInteger(x) || x < 0))
            throw new UsageError('批任务格式不合法');
    }
    const params = renderParams('视频');
    const resultLog = fs.createWriteStream(path.join(outPath!, '结果.tsv'), { flags: 'a' });
    const logLine = (s: string) => { console.log(s); resultLog.write(s + '\n'); };
    try {
        os.setPriority(0, 10);
    }
    catch { }
    const compositionCache = new Map<string, Awaited<ReturnType<typeof getCompositions>>>();
    let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
    let failCount = 0;
    const gate = openGateBatch({ 种: '批', 项数: tasks.length, 用途: process.env.ANIM_PURPOSE ?? '实验', ...(p.值['--连贯'] ? { coherent: { reason: p.值['--连贯'] } } : {}) });
    try {
        for (const t of tasks) {
            const frames = parseFrames(t.frameRange);
            const keepFrames = t.留 === '全' ? new Set(frames) : new Set(t.留 ? parseFrames(t.留) : [frames.at(-1)!]);
            const outDir = path.join(outPath!, t.名);
            fs.mkdirSync(outDir, { recursive: true });
            await gate.runTask({ 段: t.段, 帧数: frames.length, 帧: t.frameRange.slice(0, 60) }, async () => {
                browser ??= await openBrowser('chrome', { chromiumOptions: { gl: params.gl }, forceDeviceScaleFactor: params.scale, logLevel: 'error', browserExecutable: await prepareBrowser() });
                const logStream = fs.createWriteStream(path.join(outDir, '日志.txt'));
                const lines: string[] = [];
                const loadBefore = os.loadavg()[0].toFixed(1);
                const t0 = Date.now();
                try {
                    const serveUrl = packPaths[t.包]!;
                    if (!compositionCache.has(serveUrl))
                        compositionCache.set(serveUrl, await getCompositions(serveUrl, { inputProps: params.inputProps, puppeteerInstance: browser, chromiumOptions: { gl: params.gl }, timeoutInMilliseconds: frameTimeoutMs, logLevel: 'error' }));
                    const composition = compositionCache.get(serveUrl)!.find((c) => c.id === t.段)!;
                    const t1 = Date.now();
                    await renderFrames({
                        serveUrl, composition, outputDir: null, frames: frames, inputProps: params.inputProps, puppeteerInstance: browser, chromiumOptions: { gl: params.gl },
                        envVariables: segRenderEnv(t.段, segTerrainNow((await selectSegs([t.段]))[0]!)),
                        imageFormat: 'png', scale: params.scale, concurrency: 1, timeoutInMilliseconds: frameTimeoutMs, logLevel: 'error',
                        onStart: () => { }, onFrameUpdate: () => { },
                        onBrowserLog: (l) => { if (l.text.startsWith('@'))
                            logStream.write(l.text + '\n'); },
                        onFrameBuffer: (buf, f) => {
                            gateHeartbeat(lines.length + 1);
                            lines.push(`${f}=${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)}`);
                            if (keepFrames.has(f))
                                fs.writeFileSync(path.join(outDir, `${String(f).padStart(4, '0')}.png`), buf);
                        },
                    });
                    fs.writeFileSync(path.join(outDir, 'sha.txt'), lines.join('\n') + '\n');
                    logLine(`${t.名}\t${t.包}\t${t.段}\t${t.frameRange}\t${((Date.now() - t1) / 1000).toFixed(1)}秒\t总${((Date.now() - t0) / 1000).toFixed(1)}秒\t载${loadBefore}→${os.loadavg()[0].toFixed(1)}\t末=${lines.at(-1)}`);
                }
                catch (e) {
                    failCount++;
                    logLine(`${t.名}\t失败\t${(e as Error).message.slice(0, 300)}`);
                }
                finally {
                    if (!p.toggles.has('--保留浏览器')) {
                        await browser!.close({ silent: true });
                        browser = undefined;
                    }
                    logStream.end();
                }
            });
        }
    }
    finally {
        await browser?.close({ silent: true });
        gate.结束();
        resultLog.end();
    }
    console.log(`批完成，失败 ${failCount} 项`);
    return failCount ? 1 : 0;
};
export const batchCommands: Record<string, Command> = { 批: { 用法: '批 <任务文件> <输出目录> [--保留浏览器] [--连贯 <为什么>]', 说明: '预打包任务批；默认新浏览器，按累计持锁时间或指令让路；PKGS 给包表', 跑: runBatch } };
