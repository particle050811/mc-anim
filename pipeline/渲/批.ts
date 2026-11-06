// anim 批：复用准备好的包；任务一行 <包键> <段> <帧串> <名> [留=全|帧,帧]。
// 每项新浏览器是为了核对加载历史；显式 --保留浏览器 才跨项复用。PKGS 是包键到本地包目录的 JSON。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 备浏览器 } from './浏览器.ts';
import { getCompositions, openBrowser, renderFrames } from './渲染器.ts';
import { 开闸批, 闸心跳 } from '../闸/闸.ts';
import { 解析参数, 用法错误 } from '../cli/参数.ts';
import type { 命令 } from '../cli/命令.ts';
import { 渲染参数, 等帧超时毫秒 } from './设置.ts';
import { 选段 } from '../清单/清单.ts';
import { 段渲染环境, 段现在的地形 } from './地形注入.ts';
export const 跑批 = async (args: string[]) => {
    const p = 解析参数(args, { 开关: ['--保留浏览器'], 值: ['--连贯'] });
    const [任务文件, 出] = p.位置;
    if (!任务文件 || !出 || !process.env.PKGS)
        throw new 用法错误('批 需要任务文件、输出目录和 PKGS 包表');
    fs.mkdirSync(出!, { recursive: true });
    const 包表 = JSON.parse(process.env.PKGS!) as Record<string, string>;
    const 任务 = fs.readFileSync(任务文件!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
        const [包, 段, 帧串, 名, 留] = l.split(/\s+/);
        return { 包: 包!, 段: 段!, 帧串: 帧串!, 名: 名!, 留: 留?.replace(/^留=/, '') ?? '' };
    });
    const 解帧 = (串: string) => 串.split(',').flatMap((x) => { const m = /^(\d+)-(\d+)$/.exec(x); return m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i) : [Number(x)]; });
    for (const t of 任务) {
        if (!t.名 || /[\\/]/.test(t.名) || !包表[t.包] || !t.帧串 || 解帧(t.帧串).some(x => !Number.isInteger(x) || x < 0))
            throw new 用法错误('批任务格式不合法');
    }
    const 参数 = 渲染参数('视频');
    const 结果 = fs.createWriteStream(path.join(出!, '结果.tsv'), { flags: 'a' });
    const 记 = (s: string) => { console.log(s); 结果.write(s + '\n'); };
    try {
        os.setPriority(0, 10);
    }
    catch { }
    const 组合缓存 = new Map<string, Awaited<ReturnType<typeof getCompositions>>>();
    let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
    let 失败 = 0;
    const 批 = 开闸批({ 种: '批', 项数: 任务.length, 用途: process.env.ANIM_PURPOSE ?? '实验', ...(p.值['--连贯'] ? { 连贯: { 为什么: p.值['--连贯'] } } : {}) });
    try {
        for (const t of 任务) {
            const 帧们 = 解帧(t.帧串);
            const 留帧 = t.留 === '全' ? new Set(帧们) : new Set(t.留 ? 解帧(t.留) : [帧们.at(-1)!]);
            const 目录 = path.join(出!, t.名);
            fs.mkdirSync(目录, { recursive: true });
            await 批.一项({ 段: t.段, 帧数: 帧们.length, 帧: t.帧串.slice(0, 60) }, async () => {
                browser ??= await openBrowser('chrome', { chromiumOptions: { gl: 参数.gl }, forceDeviceScaleFactor: 参数.scale, logLevel: 'error', browserExecutable: await 备浏览器() });
                const 日志 = fs.createWriteStream(path.join(目录, '日志.txt'));
                const 行: string[] = [];
                const 载前 = os.loadavg()[0].toFixed(1);
                const t0 = Date.now();
                try {
                    const serveUrl = 包表[t.包]!;
                    if (!组合缓存.has(serveUrl))
                        组合缓存.set(serveUrl, await getCompositions(serveUrl, { inputProps: 参数.inputProps, puppeteerInstance: browser, chromiumOptions: { gl: 参数.gl }, timeoutInMilliseconds: 等帧超时毫秒, logLevel: 'error' }));
                    const composition = 组合缓存.get(serveUrl)!.find((c) => c.id === t.段)!;
                    const t1 = Date.now();
                    await renderFrames({
                        serveUrl, composition, outputDir: null, frames: 帧们, inputProps: 参数.inputProps, puppeteerInstance: browser, chromiumOptions: { gl: 参数.gl },
                        envVariables: 段渲染环境(t.段, 段现在的地形((await 选段([t.段]))[0]!)),
                        imageFormat: 'png', scale: 参数.scale, concurrency: 1, timeoutInMilliseconds: 等帧超时毫秒, logLevel: 'error',
                        onStart: () => { }, onFrameUpdate: () => { },
                        onBrowserLog: (l) => { if (l.text.startsWith('@'))
                            日志.write(l.text + '\n'); },
                        onFrameBuffer: (buf, f) => {
                            闸心跳(行.length + 1);
                            行.push(`${f}=${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)}`);
                            if (留帧.has(f))
                                fs.writeFileSync(path.join(目录, `${String(f).padStart(4, '0')}.png`), buf);
                        },
                    });
                    fs.writeFileSync(path.join(目录, 'sha.txt'), 行.join('\n') + '\n');
                    记(`${t.名}\t${t.包}\t${t.段}\t${t.帧串}\t${((Date.now() - t1) / 1000).toFixed(1)}秒\t总${((Date.now() - t0) / 1000).toFixed(1)}秒\t载${载前}→${os.loadavg()[0].toFixed(1)}\t末=${行.at(-1)}`);
                }
                catch (e) {
                    失败++;
                    记(`${t.名}\t失败\t${(e as Error).message.slice(0, 300)}`);
                }
                finally {
                    if (!p.开关.has('--保留浏览器')) {
                        await browser!.close({ silent: true });
                        browser = undefined;
                    }
                    日志.end();
                }
            });
        }
    }
    finally {
        await browser?.close({ silent: true });
        批.结束();
        结果.end();
    }
    console.log(`批完成，失败 ${失败} 项`);
    return 失败 ? 1 : 0;
};
export const 批命令: Record<string, 命令> = { 批: { 用法: '批 <任务文件> <输出目录> [--保留浏览器] [--连贯 <为什么>]', 说明: '预打包任务批；默认新浏览器，按累计持锁时间或指令让路；PKGS 给包表', 跑: 跑批 } };
