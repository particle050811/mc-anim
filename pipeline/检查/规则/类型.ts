// 类型：tsc（strict，按根下 tsconfig.json）；Python 用 ruff 和 pyright（范围在 pyproject.toml 的 [tool.ruff]、[tool.pyright]）；
// 改到 sourcing/mod/ 时编译 mod 并跑不开游戏的暮色网格核对。工具没装的记「跳过」并说怎么装，不算违规（anim doctor 另查）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { CheckReport, CheckContext } from '../上下文.ts';
import { tryRun } from '../../环境/子进程.ts';
import { isWindows, config } from '../../环境/配置.ts';
import { codeRoot } from '../../环境/路径.ts';

const packageDir = (pkg: string) => path.dirname(createRequire(import.meta.url).resolve(`${pkg}/package.json`));

const collectErrors = (c: CheckContext, output: string, report: CheckReport, labelPrefix: string, lineRule: RegExp) => {
  const lines = output.split('\n').map((l) => l.trimEnd().replaceAll(c.根 + path.sep, '')).filter(Boolean);
  const errorLines = lines.filter((l) => lineRule.test(l));
  for (const l of (errorLines.length ? errorLines : lines.slice(-10)).slice(0, 50)) report.错(`${labelPrefix}：${l.trim()}`);
  if (errorLines.length > 50) report.错(`${labelPrefix}：另有 ${errorLines.length - 50} 条，没列出`);
};

/**
 * tsc 增量缓存，每个检出一份，不进 Git（node_modules 被忽略）、删 worktree 时一起没。tsc 按文件内容哈希和编译选项判断，TS 版本不同整份作废；
 * 错误也记在里面，没改文件再跑照样报。anim check --deep 不读不写缓存，从头查一遍。
 * ruff 不开缓存：Python 文件少，省不出时间。
 */
export const tscCacheFile = (c: CheckContext) => c.absPath('node_modules/.cache/anim-check/tsc.tsbuildinfo');

export const runTsc = (c: CheckContext, report: CheckReport) => {
  if (!c.exists('tsconfig.json')) return report.跳过.push('tsc：没有 tsconfig.json');
  const incrementalFlags = c.deep ? [] : ['--incremental', '--tsBuildInfoFile', tscCacheFile(c)];
  const r = tryRun([process.execPath, path.join(packageDir('typescript'), 'bin', 'tsc'), '-p', c.absPath('tsconfig.json'), '--noEmit', '--pretty', 'false', ...incrementalFlags], { cwd: c.根 });
  if (r.退出码 !== 0) collectErrors(c, r.stdout + r.stderr, report, 'tsc', /error TS\d+/);
};

export const runRuff = (c: CheckContext, report: CheckReport) => {
  const localBin = path.join(codeRoot(), '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'ruff.exe' : 'ruff');
  const commandArgs = fs.existsSync(localBin) ? [localBin] : ['uv', 'run', '--frozen', '--project', codeRoot(), 'ruff'];
  const r = tryRun([...commandArgs, 'check', '--no-cache', '--output-format', 'concise', '.'], { cwd: c.根 });
  if (r.退出码 === null) return report.跳过.push(`ruff：跑不起来（${r.stderr.trim().split('\n')[0]}；装 uv 后 uv sync）`);
  if (r.退出码 !== 0) collectErrors(c, r.stdout + r.stderr, report, 'ruff', /:\d+:\d+: /);
};

export const runPyright = (c: CheckContext, report: CheckReport) => {
  const r = tryRun([process.execPath, path.join(packageDir('pyright'), 'index.js'), '--project', c.根], { cwd: c.根 });
  if (r.退出码 === null) return report.跳过.push(`pyright：跑不起来（${r.stderr.trim().split('\n')[0]}）`);
  if (r.退出码 !== 0) collectErrors(c, r.stdout + r.stderr, report, 'pyright', / - error: /);
};

/**
 * sourcing/mod/ 有改动（和 main 比、加上工作区）才跑。mod 没有 gradle 的 test 源集，测试是 test/*.sh：
 * 这里跑 twilight-grid-test.sh（先 gradlew build，再核对暮色网格和 mixin 织入）和 game-data-test.sh（游戏导表的出表，不开游戏）；ancient-city-test.sh 是重任务、
 * terrain-edit-test.sh 要旧项目的选种工具，都不在这里跑。Windows 没有 sh，只编译。
 */
export const runGradle = (c: CheckContext, report: CheckReport) => {
  const mod = 'sourcing/mod';
  const wrapper = `${mod}/${isWindows ? 'gradlew.bat' : 'gradlew'}`;
  if (!c.exists(wrapper)) return report.跳过.push(`mod 编译：还没有 ${wrapper}`);
  const diffProbes = [tryRun(['git', '-C', c.根, 'diff', '--name-only', 'main...HEAD']), tryRun(['git', '-C', c.根, 'status', '--porcelain'])];
  const notInGit = diffProbes.some((x) => x.退出码 !== 0);
  if (!notInGit && !diffProbes.some((x) => x.stdout.includes(`${mod}/`))) return report.跳过.push('mod 编译和核对：这次没改到 sourcing/mod/');
  // build.gradle 从 MCAI_GAME 读暮色森林的 jar；1.20.1 的 ForgeGradle 要 JDK 17，配了 ANIM_JAVA_HOME 就用它
  const java = config('java_home');
  const env = { ...process.env, MCAI_GAME: config('游戏'), ...(java ? { JAVA_HOME: java, MCAI_JAVA_HOME: java } : {}) };
  if (isWindows) {
    const r = tryRun([c.absPath(wrapper), 'build', '--console=plain'], { cwd: c.absPath(mod), env });
    if (r.退出码 !== 0) collectErrors(c, r.stdout + r.stderr, report, 'mod 编译', /FAILED|error:/);
    return report.跳过.push('mod 核对：Windows 上没有 sh，只编译，test/twilight-grid-test.sh 没跑');
  }
  const r = tryRun(['sh', 'test/twilight-grid-test.sh'], { cwd: c.absPath(mod), env });
  if (r.退出码 !== 0) collectErrors(c, r.stdout + r.stderr, report, 'mod 编译和暮色网格核对', /FAILED|error:|错误|Exception/);
  const g = tryRun(['sh', 'test/game-data-test.sh'], { cwd: c.absPath(mod), env });
  if (g.退出码 !== 0) collectErrors(c, g.stdout + g.stderr, report, '游戏导表出表核对', /没过|error:|Exception/);
};

export const typeCheck = async (c: CheckContext, report: CheckReport) => {
  runTsc(c, report);
  if (c.文件().some((p) => p.endsWith('.py'))) {
    runRuff(c, report);
    runPyright(c, report);
  }
  runGradle(c, report);
};
