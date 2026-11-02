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
// 丢掉截点上的整个词，避免 URL 的 @ 被切掉后把半截密码当普通文本留下。
const 截 = (s: string) => s.length > 4000 ? s.slice(0, 4000).replace(/\S*$/, '') : s;
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
// 空格头只认明确的 x-api-key，不把「api-key 说明」「token 满了」当名值对。
const 空格头 = new RegExp(String.raw`(${词首}x-api-key[ \t]+)(?:${值}|[^\s&"';|]+)`, 'gi');
// 只看值的第一个词：中文说明不遮，但「fake 是测试值」仍必须遮住 fake。
const 头值可遮 = (s: string) => {
    const 首词 = s.replace(/^["']/, '').match(/^[^\s;|&]+/)?.[0];
    return 首词 !== undefined && !/[^\x00-\x7f]/.test(首词);
};
// 调用方都只留几百字；先封顶，避免一长串 key-key-… 的回溯开销。
const 遮文字 = (s: string) => 截(s)
    .replace(头, `$1${遮}`)
    .replace(/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^/@\r\n]+@/gi, `$1${遮}@`)
    .replace(空格头, (全: string, 头名: string) => 头值可遮(全.slice(头名.length)) ? 头名 + 遮 : 全)
    .replace(new RegExp(String.raw`\bSSHPASS=(?:${值}|\S+)`, 'g'), `SSHPASS=${遮}`)
    .replace(名值, `$1${遮}`)
    .replace(开关值, `$1${遮}`)
    .replace(new RegExp(String.raw`\bBearer\s+(?:${值}|\S+)`, 'gi'), `Bearer ${遮}`)
    .replace(/\b(?:(?:sk-|gh[pousr]_|github_pat_)[\w-]{4,}|(?:sk_live_|xoxb-)[\w-]+)/g, 遮);
type 登录选项 = { 分开: string[]; 连写: string[]; 长: string[]; 带值: Set<string>; 短组?: boolean; 有子命令?: boolean };
const 数据库选项: 登录选项 = {
    // mysql 的 -p 单独出现是交互输入密码，后面的数据库名不能遮；-P 是端口，-U 是安全更新开关。
    分开: ['-u'], 连写: ['-u', '-p'], 长: ['--user'],
    带值: new Set(['-h', '--host', '-P', '--port', '-S', '--socket', '-e', '--execute', '-D', '--database', '--password']),
};
const 登录工具: Record<string, 登录选项> = {
    curl: { 分开: ['-u', '-U'], 连写: ['-u', '-U'], 长: ['--user', '--proxy-user'], 短组: true,
        带值: new Set(['--header', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--output', '--user-agent', '--referer', '--url', '--proxy', '--request']) },
    mysql: 数据库选项, mariadb: 数据库选项, mysqldump: 数据库选项, mysqladmin: 数据库选项, 'mariadb-dump': 数据库选项,
    sshpass: { 分开: ['-p'], 连写: ['-p'], 长: [], 带值: new Set(['-f', '-d', '-P']), 有子命令: true },
};
const 工具名 = (s: string) => s.split(/[\\/]/).at(-1)!.replace(/\.exe$/i, '').toLowerCase();
// 非 ASCII 的说明不是凭据；但「张三:pw」有明确的 ASCII 冒号，仍须遮住。
const 像凭据 = (s: string) => !/[^\x00-\x7f]/.test(s) || s.includes(':');
// curl 的带值短选项会吃掉组内余串或下一项，不能继续把正文里的 u 当登录选项；f 是开关。
const curl带值短项 = new Set('AbcCdDeEFHKmoPQrtTwxXyYz');
/** 这里只处理命令位置的工具名；anim 参数中的示例另走窄规则。 */
const 登录参数替换 = (argv: readonly string[]) => {
    const 换 = new Map<number, string>();
    const 工具 = 工具名(argv[0] ?? '');
    const 选项 = Object.hasOwn(登录工具, 工具) ? 登录工具[工具]! : undefined;
    if (!选项) return 换;
    const 记 = (i: number, 前缀 = '') => {
        if (i < argv.length && 像凭据(argv[i]!.slice(前缀.length))) 换.set(i, 前缀 + 遮);
    };
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === '--') break;
        const 长 = 选项.长.find(k => a.startsWith(k + '='));
        if (选项.分开.includes(a) || 选项.长.includes(a)) 记(++i);
        else if (长) 记(i, 长 + '=');
        else if (选项.短组 && /^-[^-]/.test(a)) {
            for (let j = 1; j < a.length; j++) {
                const 字 = a[j]!;
                if (字 === 'u' || 字 === 'U') {
                    if (j === a.length - 1) 记(++i);
                    else 记(i, a.slice(0, j + 1));
                    break;
                }
                if (curl带值短项.has(字)) {
                    if (j === a.length - 1) i++;
                    break;
                }
            }
        } else {
            const 前缀 = 选项.连写.find(k => a.startsWith(k) && a.length > k.length);
            if (前缀) 记(i, 前缀);
            // -e 的 SQL、--data 的正文即便恰好是 -pX、-u 也不是登录参数。
            else if (选项.带值.has(a)) i++;
            else if (选项.有子命令 && !a.startsWith('-')) break;
        }
    }
    return 换;
};
const 遮空格头项 = (a: string, 前项 = '') => {
    if (/^x-api-key$/i.test(前项)) return 头值可遮(a) ? 遮 : a;
    const 头名 = /^x-api-key[ \t]+/i.exec(a)?.[0];
    return 头名 && 头值可遮(a.slice(头名.length)) ? 头名 + 遮 : a;
};
/** 文本已经丢失 argv 边界，只按字面引号、转义和命令分隔符分词，不执行 shell 或展开变量。 */
const 分词 = (s: string) => [...s.matchAll(/&&|\|\||[;|&\r\n]|(?:\\[\s\S]|"(?:\\[\s\S]|[^"\\])*(?:"|$)|'[^']*(?:'|$)|[^\s"'\\;|&])+/g)].map(m => ({
    原: m[0], 起: m.index,
    字: m[0].replace(/"((?:\\[\s\S]|[^"\\])*)(?:"|$)|'([^']*)(?:'|$)|\\([\s\S])/g,
        (_全, 双: string | undefined, 单: string | undefined, 转: string | undefined) => 双?.replace(/\\(["\\$`\n])/g, '$1') ?? 单 ?? 转!),
}));
type 文本词 = ReturnType<typeof 分词>[number];
const 是分隔符 = (t: 文本词) => /^(?:&&|\|\||[;|&\r\n])$/.test(t.原);
// 无引号的 Windows 路径不按 shell 转义吃掉反斜杠；cu"r"l 仍使用解引号后的字。
const 工具词 = (t: 文本词) => t.原.includes('\\') && !/^["']/.test(t.原) ? t.原 : t.字;
const 是管线命令 = (s: string) => ['anim', 'node'].includes(工具名(s));
const 写回 = (s: string, 词: 文本词[], 换: Map<number, string>) => {
    let out = '', 尾 = 0;
    for (const [i, 新] of [...换].sort(([a], [b]) => a - b)) {
        const t = 词[i]!;
        if (新 === t.字) continue;
        const 引号 = /^['"]/.test(t.原) && t.原.endsWith(t.原[0]!) ? t.原[0]! : '';
        out += s.slice(尾, t.起) + 引号 + 新 + 引号;
        尾 = t.起 + t.原.length;
    }
    return out + s.slice(尾);
};
const 内嵌参数替换 = (词: 文本词[]) => {
    const 换 = new Map<number, string>();
    for (let i = 0; i < 词.length; i++) {
        // 只认独立工具名，不把文件路径里的 curl/mysql 目录名当命令。
        const 工具 = 词[i]!.字.replace(/\.exe$/i, '').toLowerCase();
        const 选项 = Object.hasOwn(登录工具, 工具) ? 登录工具[工具]! : undefined;
        const 项 = 词[i + 1], 值词 = 词[i + 2];
        if (!选项 || !项 || 是分隔符(项)) continue;
        if (项.字 === '-u' && 选项.分开.includes('-u') && 值词 && !是分隔符(值词) && 值词.字.includes(':')) 换.set(i + 2, 遮);
        else if (/^-p[\x00-\x7f]+$/.test(项.字) && 选项.连写.includes('-p')) 换.set(i + 1, '-p' + 遮);
        else if (工具 === 'sshpass' && 项.字 === '-p' && 值词 && !是分隔符(值词) && 像凭据(值词.字)) 换.set(i + 2, 遮);
    }
    return 换;
};
// 用户定：anim/node 的参数只遮紧跟工具名的 -u x:y、-pASCII、sshpass -p X，不能整项吞掉段名、理由或路径。
const 遮内嵌登录 = (s: string) => {
    const 词 = 分词(s);
    return 写回(s, 词, 内嵌参数替换(词));
};
const 遮命令文本 = (s: string) => {
    if (/^x-api-key[ \t]+[^\r\n]*$/i.test(s)) return 遮空格头项(s);
    const 词 = 分词(s);
    const 首 = 词.find(t => !是分隔符(t));
    const 管线命令 = 首 !== undefined && 是管线命令(工具词(首));
    const 换 = 管线命令 ? 内嵌参数替换(词) : new Map<number, string>();
    if (!管线命令) {
        for (let 起 = 0; 起 < 词.length;) {
            let 尾 = 起;
            while (尾 < 词.length && !是分隔符(词[尾]!)) 尾++;
            // 只支持不带选项的壳前缀；sudo -u、bash -c 等不在这里猜测。
            while (起 < 尾 && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(词[起]!.字) || /^(?:env|sudo|time|nohup|command|exec)$/.test(词[起]!.字))) 起++;
            if (起 < 尾) {
                const argv = 词.slice(起, 尾).map((t, i) => i === 0 ? 工具词(t) : t.字);
                for (const [i, 新] of 登录参数替换(argv)) 换.set(起 + i, 新);
            }
            起 = 尾 + 1;
        }
    }
    for (let i = 0; i < 词.length; i++) {
        const t = 词[i]!;
        if (是分隔符(t) || 换.has(i)) continue;
        const 新 = 遮空格头项(管线命令 ? 遮内嵌登录(t.字) : t.字, 词[i - 1]?.字);
        if (新 !== t.字) 换.set(i, 新);
    }
    return 写回(s, 词, 换);
};
export const 遮密 = (s: string) => 遮文字(遮命令文本(截(s)));
/** 逐项遮再拼：argv 已去引号，拼起来就分不清值里的空格和下一项了。 */
export const 遮命令 = (argv: readonly string[]) => {
    const 换 = 登录参数替换(argv);
    const 管线命令 = 是管线命令(argv[0] ?? '');
    return argv.map((a, i) => {
        a = 截(a);
        if (换.has(i)) return 换.get(i)!;
        // 这一项本身是 名=值 或 头: 值：认第一个分隔符，后面整项都是值，否则值里的等号会把密钥算进名字。
        const 名部 = /^[^\s=:：]+\s*[=:：]\s*/.exec(a)?.[0];
        if (名部 && (敏感名.test(名部) || 名部 === 'SSHPASS=')) return 名部 + 遮;
        return /^--?[^=]+$/.test(argv[i - 1] ?? '') && 敏感名.test(argv[i - 1]!) ? 遮 : 遮文字(遮空格头项(管线命令 ? 遮内嵌登录(a) : a, argv[i - 1]));
    }).join(' ');
};
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
