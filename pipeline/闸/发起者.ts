import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {代码根} from '../环境/路径.ts';
export type 发起者 = {
    来源: string;
    会话: string;
    路: string;
    工作区: string;
    分支: string;
    提交: string;
    cwd: string;
    pid: number;
    ppid: number;
    父链?: number[];
    命令: string;
    子会话: boolean;
    代理标: string;
};
const 遮 = '[已遮蔽]';
// 短词只认整段（DB_PASS、--auth）：不然 bypass、author、keyframe 也会被遮。
const 敏感词 = String.raw`token|secret|passw(?:or)?d|passphrase|credential|cookie|authorization|(?:api|access|private)[-_]?key|(?<![a-z0-9])(?:key|pass|pwd|o?auth)(?![a-z0-9])`;
// 引号没配对时算到末尾：不然值里的空格后面还露着。
const 名 = String.raw`[\w.-]*(?:${敏感词})[\w.-]*`, 值 = String.raw`"[^"]*(?:"|$)|'[^']*(?:'|$)`;
export const 敏感名 = new RegExp(敏感词, 'i');
// 开头都锚在词首：不然一长串没空格的参数，每个起点都要回溯一遍，平方级。
const 词首 = String.raw`(?<![\w.-])`;
// 头的值里可以有空格、引号和分号（Bearer "x"、sid="x"; o=y），到行尾都算；遮多了只丢日志里的一点上下文。
const 头 = new RegExp(String.raw`(${词首}(?:[\w.-]*(?:authorization|cookies?)|x-${名})["']?\s*[=:：]\s*)[^\r\n]*`, 'gi');
const 名值 = new RegExp(String.raw`(${词首}${名}["']?\s*[=:：]\s*)(?:${值}|[^\s&"']+)`, 'gi');
const 开关值 = new RegExp(String.raw`(${词首}--?${名}\s+)(?:${值}|\S+)`, 'gi');
/** 日志不是凭据容器。空格分隔的只认 --token abc，「token 满了」这种话不遮。 */
export const 遮密 = (s: string) => s
    // 调用方都只留几百字；不截的话一长串 key-key-… 仍是平方级。
    .slice(0, 4000)
    .replace(头, `$1${遮}`)
    .replace(/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^/@\r\n]+@/gi, `$1${遮}@`)
    .replace(名值, `$1${遮}`)
    .replace(开关值, `$1${遮}`)
    .replace(new RegExp(String.raw`\bBearer\s+(?:${值}|\S+)`, 'gi'), `Bearer ${遮}`)
    .replace(/\b(?:sk-|gh[pousr]_|github_pat_)[\w-]{4,}/g, 遮);
/** 逐项遮再拼：argv 已去引号，拼起来就分不清值里的空格和下一项了。 */
export const 遮命令 = (argv: readonly string[]) => argv.map((a, i) => {
    // 这一项本身是 名=值 或 头: 值：认第一个分隔符，后面整项都是值，否则值里的等号会把密钥算进名字。
    const 名部 = /^[^\s=:：]+\s*[=:：]\s*/.exec(a)?.[0];
    if (名部 && 敏感名.test(名部))
        return 名部 + 遮;
    return /^--?[^=]+$/.test(argv[i - 1] ?? '') && 敏感名.test(argv[i - 1]!) ? 遮 : 遮密(a);
}).join(' ');
export const 读发起者 = (env: NodeJS.ProcessEnv = process.env, argv = process.argv, cwd = process.cwd(), git = true): 发起者 => {
    const root=git?代码根():cwd;
    const 父链:number[]=[process.ppid];
    if(git){try{const table=new Map(execFileSync('ps',['-A','-o','pid=,ppid='],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number) as [number,number]));for(let p=table.get(process.ppid);p&&p>1&&父链.length<8&&!父链.includes(p);p=table.get(p))父链.push(p);}catch{/* 不支持 ps 的平台只记直接父进程 */}}
    const 查 = (args: string[]) => { try {
        return execFileSync('git', args, { cwd:root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return '?';
    } };
    return { 来源: env.CODEX_THREAD_ID ? 'codex' : env.CLAUDE_CODE_SESSION_ID ? 'claude' : '人',
        会话: (env.CODEX_THREAD_ID ?? env.CLAUDE_CODE_SESSION_ID ?? '').slice(0, 8), 路: 遮密(env.ANIM_ROUTE ?? '').slice(0, 80),
        工作区: path.basename(root), cwd, 分支: git ? 查(['branch', '--show-current']) : '?', 提交: git ? 查(['rev-parse', '--short', 'HEAD']) : '?',
        pid: process.pid, ppid: process.ppid, 父链, 命令: 遮命令(argv).slice(0, 200), 子会话: env.CLAUDE_CODE_CHILD_SESSION === '1', 代理标: 遮密(env.AI_AGENT ?? '').slice(0, 80) };
};
