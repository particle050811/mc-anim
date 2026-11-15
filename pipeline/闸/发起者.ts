import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {codeRoot} from '../环境/路径.ts';
export type Caller = {
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
const maskedLabel = '[已遮蔽]';
// 丢掉截点上的整个词，避免 URL 的 @ 被切掉后把半截密码当普通文本留下。
const truncate = (s: string) => s.length > 4000 ? s.slice(0, 4000).replace(/\S*$/, '') : s;
// 短词只认整段（DB_PASS、--auth）：不然 bypass、author、keyframe 也会被遮。
const sensitiveWords = String.raw`token|secret|passw(?:or)?d|passphrase|credential|cookie|authorization|(?:api|access|private)[-_]?key|(?<![a-z0-9])(?:key|pass|pwd|o?auth)(?![a-z0-9])`;
// 引号没配对时算到末尾：不然值里的空格后面还露着。
const sensitiveNamePattern = String.raw`[\w.-]*(?:${sensitiveWords})[\w.-]*`, valuePattern = String.raw`"[^"]*(?:"|$)|'[^']*(?:'|$)`;
export const sensitiveRe = new RegExp(sensitiveWords, 'i');
// 开头都锚在词首：不然一长串没空格的参数，每个起点都要回溯一遍，平方级。
const wordStart = String.raw`(?<![\w.-])`;
// 头的值里可以有空格、引号和分号（Bearer "x"、sid="x"; o=y），到行尾都算；遮多了只丢日志里的一点上下文。
const headerPattern = new RegExp(String.raw`(${wordStart}(?:[\w.-]*(?:authorization|cookies?)|x-${sensitiveNamePattern})["']?\s*[=:：]\s*)[^\r\n]*`, 'gi');
const nameValueRe = new RegExp(String.raw`(${wordStart}${sensitiveNamePattern}["']?\s*[=:：]\s*)(?:${valuePattern}|[^\s&"']+)`, 'gi');
const flagValueRe = new RegExp(String.raw`(${wordStart}--?${sensitiveNamePattern}\s+)(?:${valuePattern}|\S+)`, 'gi');
// 空格头只认明确的 x-api-key，不把「api-key 说明」「token 满了」当名值对。
const spaceHeaderRe = new RegExp(String.raw`(${wordStart}x-api-key[ \t]+)(?:${valuePattern}|[^\s&"';|]+)`, 'gi');
// 只看值的第一个词：中文说明不遮，但「fake 是测试值」仍必须遮住 fake。
const isMaskableHeaderValue = (s: string) => {
    const firstWord = s.replace(/^["']/, '').match(/^[^\s;|&]+/)?.[0];
    return firstWord !== undefined && !/[^\x00-\x7f]/.test(firstWord);
};
// 调用方都只留几百字；先封顶，避免一长串 key-key-… 的回溯开销。
const maskText = (s: string) => truncate(s)
    .replace(headerPattern, `$1${maskedLabel}`)
    .replace(/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^/@\r\n]+@/gi, `$1${maskedLabel}@`)
    .replace(spaceHeaderRe, (whole: string, headName: string) => isMaskableHeaderValue(whole.slice(headName.length)) ? headName + maskedLabel : whole)
    .replace(new RegExp(String.raw`\bSSHPASS=(?:${valuePattern}|\S+)`, 'g'), `SSHPASS=${maskedLabel}`)
    .replace(nameValueRe, `$1${maskedLabel}`)
    .replace(flagValueRe, `$1${maskedLabel}`)
    .replace(new RegExp(String.raw`\bBearer\s+(?:${valuePattern}|\S+)`, 'gi'), `Bearer ${maskedLabel}`)
    .replace(/\b(?:(?:sk-|gh[pousr]_|github_pat_)[\w-]{4,}|(?:sk_live_|xoxb-)[\w-]+)/g, maskedLabel);
type LoginOptions = { separateFlags: string[]; combinedShort: string[]; 长: string[]; takesValue: Set<string>; shortGroup?: boolean; hasSubcommands?: boolean };
const dbLoginOpts: LoginOptions = {
    // mysql 的 -p 单独出现是交互输入密码，后面的数据库名不能遮；-P 是端口，-U 是安全更新开关。
    separateFlags: ['-u'], combinedShort: ['-u', '-p'], 长: ['--user'],
    takesValue: new Set(['-h', '--host', '-P', '--port', '-S', '--socket', '-e', '--execute', '-D', '--database', '--password']),
};
const loginTools: Record<string, LoginOptions> = {
    curl: { separateFlags: ['-u', '-U'], combinedShort: ['-u', '-U'], 长: ['--user', '--proxy-user'], shortGroup: true,
        takesValue: new Set(['--header', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--output', '--user-agent', '--referer', '--url', '--proxy', '--request']) },
    mysql: dbLoginOpts, mariadb: dbLoginOpts, mysqldump: dbLoginOpts, mysqladmin: dbLoginOpts, 'mariadb-dump': dbLoginOpts,
    sshpass: { separateFlags: ['-p'], combinedShort: ['-p'], 长: [], takesValue: new Set(['-f', '-d', '-P']), hasSubcommands: true },
};
const toolName = (s: string) => s.split(/[\\/]/).at(-1)!.replace(/\.exe$/i, '').toLowerCase();
// 非 ASCII 的说明不是凭据；但「张三:pw」有明确的 ASCII 冒号，仍须遮住。
const looksLikeCred = (s: string) => !/[^\x00-\x7f]/.test(s) || s.includes(':');
// curl 的带值短选项会吃掉组内余串或下一项，不能继续把正文里的 u 当登录选项；f 是开关。
const curlShortWithValue = new Set('AbcCdDeEFHKmoPQrtTwxXyYz');
/** 这里只处理命令位置的工具名；anim 参数中的示例另走窄规则。 */
const replaceLoginArgs = (argv: readonly string[]) => {
    const replacements = new Map<number, string>();
    const tool = toolName(argv[0] ?? '');
    const options = Object.hasOwn(loginTools, tool) ? loginTools[tool]! : undefined;
    if (!options) return replacements;
    const skipArg = (i: number, optionPrefix = '') => {
        if (i < argv.length && looksLikeCred(argv[i]!.slice(optionPrefix.length))) replacements.set(i, optionPrefix + maskedLabel);
    };
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === '--') break;
        const longOptLength = options.长.find(k => a.startsWith(k + '='));
        if (options.separateFlags.includes(a) || options.长.includes(a)) skipArg(++i);
        else if (longOptLength) skipArg(i, longOptLength + '=');
        else if (options.shortGroup && /^-[^-]/.test(a)) {
            for (let j = 1; j < a.length; j++) {
                const char = a[j]!;
                if (char === 'u' || char === 'U') {
                    if (j === a.length - 1) skipArg(++i);
                    else skipArg(i, a.slice(0, j + 1));
                    break;
                }
                if (curlShortWithValue.has(char)) {
                    if (j === a.length - 1) i++;
                    break;
                }
            }
        } else {
            const optionPrefix = options.combinedShort.find(k => a.startsWith(k) && a.length > k.length);
            if (optionPrefix) skipArg(i, optionPrefix);
            // -e 的 SQL、--data 的正文即便恰好是 -pX、-u 也不是登录参数。
            else if (options.takesValue.has(a)) i++;
            else if (options.hasSubcommands && !a.startsWith('-')) break;
        }
    }
    return replacements;
};
const maskSpacedHeader = (a: string, prevItem = '') => {
    if (/^x-api-key$/i.test(prevItem)) return isMaskableHeaderValue(a) ? maskedLabel : a;
    const headName = /^x-api-key[ \t]+/i.exec(a)?.[0];
    return headName && isMaskableHeaderValue(a.slice(headName.length)) ? headName + maskedLabel : a;
};
/** 文本已经丢失 argv 边界，只按字面引号、转义和命令分隔符分词，不执行 shell 或展开变量。 */
const tokenize = (s: string) => [...s.matchAll(/&&|\|\||[;|&\r\n]|(?:\\[\s\S]|"(?:\\[\s\S]|[^"\\])*(?:"|$)|'[^']*(?:'|$)|[^\s"'\\;|&])+/g)].map(m => ({
    原: m[0], 起: m.index,
    字: m[0].replace(/"((?:\\[\s\S]|[^"\\])*)(?:"|$)|'([^']*)(?:'|$)|\\([\s\S])/g,
        (fullMatch, doubleQuoted: string | undefined, singleQuoted: string | undefined, backtick: string | undefined) => doubleQuoted?.replace(/\\(["\\$`\n])/g, '$1') ?? singleQuoted ?? backtick!),
}));
type TextWord = ReturnType<typeof tokenize>[number];
const isSeparator = (t: TextWord) => /^(?:&&|\|\||[;|&\r\n])$/.test(t.原);
// 无引号的 Windows 路径不按 shell 转义吃掉反斜杠；cu"r"l 仍使用解引号后的字。
const toolWord = (t: TextWord) => t.原.includes('\\') && !/^["']/.test(t.原) ? t.原 : t.字;
const isPipelineCommand = (s: string) => ['anim', 'node'].includes(toolName(s));
const writeBack = (s: string, tokens: TextWord[], replacements: Map<number, string>) => {
    let out = '', cursor = 0;
    for (const [i, replacement] of [...replacements].sort(([a], [b]) => a - b)) {
        const t = tokens[i]!;
        if (replacement === t.字) continue;
        const quote = /^['"]/.test(t.原) && t.原.endsWith(t.原[0]!) ? t.原[0]! : '';
        out += s.slice(cursor, t.起) + quote + replacement + quote;
        cursor = t.起 + t.原.length;
    }
    return out + s.slice(cursor);
};
const replaceInlineArgs = (tokens: TextWord[]) => {
    const replacements = new Map<number, string>();
    for (let i = 0; i < tokens.length; i++) {
        // 只认独立工具名，不把文件路径里的 curl/mysql 目录名当命令。
        const tool = tokens[i]!.字.replace(/\.exe$/i, '').toLowerCase();
        const options = Object.hasOwn(loginTools, tool) ? loginTools[tool]! : undefined;
        const item = tokens[i + 1], valueWord = tokens[i + 2];
        if (!options || !item || isSeparator(item)) continue;
        if (item.字 === '-u' && options.separateFlags.includes('-u') && valueWord && !isSeparator(valueWord) && valueWord.字.includes(':')) replacements.set(i + 2, maskedLabel);
        else if (/^-p[\x00-\x7f]+$/.test(item.字) && options.combinedShort.includes('-p')) replacements.set(i + 1, '-p' + maskedLabel);
        else if (tool === 'sshpass' && item.字 === '-p' && valueWord && !isSeparator(valueWord) && looksLikeCred(valueWord.字)) replacements.set(i + 2, maskedLabel);
    }
    return replacements;
};
// 用户定：anim/node 的参数只遮紧跟工具名的 -u x:y、-pASCII、sshpass -p X，不能整项吞掉段名、理由或路径。
const maskInlineLogin = (s: string) => {
    const tokens = tokenize(s);
    return writeBack(s, tokens, replaceInlineArgs(tokens));
};
const maskCommandText = (s: string) => {
    if (/^x-api-key[ \t]+[^\r\n]*$/i.test(s)) return maskSpacedHeader(s);
    const tokens = tokenize(s);
    const firstWord = tokens.find(t => !isSeparator(t));
    const isPipeline = firstWord !== undefined && isPipelineCommand(toolWord(firstWord));
    const replacements = isPipeline ? replaceInlineArgs(tokens) : new Map<number, string>();
    if (!isPipeline) {
        for (let startIndex = 0; startIndex < tokens.length;) {
            let wordEnd = startIndex;
            while (wordEnd < tokens.length && !isSeparator(tokens[wordEnd]!)) wordEnd++;
            // 只支持不带选项的壳前缀；sudo -u、bash -c 等不在这里猜测。
            while (startIndex < wordEnd && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[startIndex]!.字) || /^(?:env|sudo|time|nohup|command|exec)$/.test(tokens[startIndex]!.字))) startIndex++;
            if (startIndex < wordEnd) {
                const argv = tokens.slice(startIndex, wordEnd).map((t, i) => i === 0 ? toolWord(t) : t.字);
                for (const [i, replacement] of replaceLoginArgs(argv)) replacements.set(startIndex + i, replacement);
            }
            startIndex = wordEnd + 1;
        }
    }
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]!;
        if (isSeparator(t) || replacements.has(i)) continue;
        const replacement = maskSpacedHeader(isPipeline ? maskInlineLogin(t.字) : t.字, tokens[i - 1]?.字);
        if (replacement !== t.字) replacements.set(i, replacement);
    }
    return writeBack(s, tokens, replacements);
};
export const maskSecret = (s: string) => maskText(maskCommandText(truncate(s)));
/** 逐项遮再拼：argv 已去引号，拼起来就分不清值里的空格和下一项了。 */
export const maskCommand = (argv: readonly string[]) => {
    const replacements = replaceLoginArgs(argv);
    const isPipeline = isPipelineCommand(argv[0] ?? '');
    return argv.map((a, i) => {
        a = truncate(a);
        if (replacements.has(i)) return replacements.get(i)!;
        // 这一项本身是 名=值 或 头: 值：认第一个分隔符，后面整项都是值，否则值里的等号会把密钥算进名字。
        const namePart = /^[^\s=:：]+\s*[=:：]\s*/.exec(a)?.[0];
        if (namePart && (sensitiveRe.test(namePart) || namePart === 'SSHPASS=')) return namePart + maskedLabel;
        return /^--?[^=]+$/.test(argv[i - 1] ?? '') && sensitiveRe.test(argv[i - 1]!) ? maskedLabel : maskText(maskSpacedHeader(isPipeline ? maskInlineLogin(a) : a, argv[i - 1]));
    }).join(' ');
};
export const readCaller = (env: NodeJS.ProcessEnv = process.env, argv = process.argv, cwd = process.cwd(), git = true): Caller => {
    const root=git?codeRoot():cwd;
    const parentChain:number[]=[process.ppid];
    if(git){try{const table=new Map(execFileSync('ps',['-A','-o','pid=,ppid='],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number) as [number,number]));for(let p=table.get(process.ppid);p&&p>1&&parentChain.length<8&&!parentChain.includes(p);p=table.get(p))parentChain.push(p);}catch{/* 不支持 ps 的平台只记直接父进程 */}}
    const runGit = (args: string[]) => { try {
        return execFileSync('git', args, { cwd:root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return '?';
    } };
    return { 来源: env.CODEX_THREAD_ID ? 'codex' : env.CLAUDE_CODE_SESSION_ID ? 'claude' : '人',
        会话: (env.CODEX_THREAD_ID ?? env.CLAUDE_CODE_SESSION_ID ?? '').slice(0, 8), 路: maskSecret(env.ANIM_ROUTE ?? '').slice(0, 80),
        工作区: path.basename(root), cwd, 分支: git ? runGit(['branch', '--show-current']) : '?', 提交: git ? runGit(['rev-parse', '--short', 'HEAD']) : '?',
        pid: process.pid, ppid: process.ppid, 父链: parentChain, 命令: maskCommand(argv).slice(0, 200), 子会话: env.CLAUDE_CODE_CHILD_SESSION === '1', 代理标: maskSecret(env.AI_AGENT ?? '').slice(0, 80) };
};
