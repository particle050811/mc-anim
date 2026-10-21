// 类型：tsc（strict，按根下 tsconfig.json）；Python 用 ruff 和 pyright（范围在 pyproject.toml 的 [tool.ruff]、[tool.pyright]）；
// 改到 sourcing/mod/ 时跑 gradle test。工具没装的记「跳过」并说怎么装，不算违规（sr doctor 另查）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { 报告, 检查上下文 } from '../上下文.ts';
import { 试跑 } from '../../环境/子进程.ts';
import { isWindows, 配置 } from '../../环境/配置.ts';
import { 代码根 } from '../../环境/路径.ts';

const 包目录 = (包: string) => path.dirname(createRequire(import.meta.url).resolve(`${包}/package.json`));

const 收错 = (c: 检查上下文, 输出: string, 报: 报告, 前缀: string, 行规则: RegExp) => {
  const 行们 = 输出.split('\n').map((l) => l.trimEnd().replaceAll(c.根 + path.sep, '')).filter(Boolean);
  const 错 = 行们.filter((l) => 行规则.test(l));
  for (const l of (错.length ? 错 : 行们.slice(-10)).slice(0, 50)) 报.错(`${前缀}：${l.trim()}`);
  if (错.length > 50) 报.错(`${前缀}：另有 ${错.length - 50} 条，没列出`);
};

export const 跑tsc = (c: 检查上下文, 报: 报告) => {
  if (!c.存在('tsconfig.json')) return 报.跳过.push('tsc：没有 tsconfig.json');
  const r = 试跑([process.execPath, path.join(包目录('typescript'), 'bin', 'tsc'), '-p', c.绝对('tsconfig.json'), '--noEmit', '--pretty', 'false'], { cwd: c.根 });
  if (r.退出码 !== 0) 收错(c, r.stdout + r.stderr, 报, 'tsc', /error TS\d+/);
};

export const 跑ruff = (c: 检查上下文, 报: 报告) => {
  const 本地 = path.join(代码根(), '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'ruff.exe' : 'ruff');
  const 命令 = fs.existsSync(本地) ? [本地] : ['uv', 'run', '--frozen', '--project', 代码根(), 'ruff'];
  const r = 试跑([...命令, 'check', '--no-cache', '--output-format', 'concise', '.'], { cwd: c.根 });
  if (r.退出码 === null) return 报.跳过.push(`ruff：跑不起来（${r.stderr.trim().split('\n')[0]}；装 uv 后 uv sync）`);
  if (r.退出码 !== 0) 收错(c, r.stdout + r.stderr, 报, 'ruff', /:\d+:\d+: /);
};

export const 跑pyright = (c: 检查上下文, 报: 报告) => {
  const r = 试跑([process.execPath, path.join(包目录('pyright'), 'index.js'), '--project', c.根], { cwd: c.根 });
  if (r.退出码 === null) return 报.跳过.push(`pyright：跑不起来（${r.stderr.trim().split('\n')[0]}）`);
  if (r.退出码 !== 0) 收错(c, r.stdout + r.stderr, 报, 'pyright', / - error: /);
};

/** sourcing/mod/ 有改动（和 main 比、加上工作区）才跑 gradle test */
export const 跑gradle = (c: 检查上下文, 报: 报告) => {
  const mod = 'sourcing/mod';
  const wrapper = `${mod}/${isWindows ? 'gradlew.bat' : 'gradlew'}`;
  if (!c.存在(wrapper)) return 报.跳过.push(`gradle test：还没有 ${wrapper}`);
  const 改了 = [试跑(['git', '-C', c.根, 'diff', '--name-only', 'main...HEAD']), 试跑(['git', '-C', c.根, 'status', '--porcelain'])];
  const 不在git = 改了.some((x) => x.退出码 !== 0);
  if (!不在git && !改了.some((x) => x.stdout.includes(`${mod}/`))) return 报.跳过.push('gradle test：这次没改到 sourcing/mod/');
  // build.gradle 从 MCAI_GAME 读暮色森林的 jar；1.20.1 的 ForgeGradle 要 JDK 17，配了 SR_JAVA_HOME 就用它
  const env = { ...process.env, MCAI_GAME: 配置('游戏'), ...(配置('java_home') ? { JAVA_HOME: 配置('java_home') } : {}) };
  const r = 试跑([c.绝对(wrapper), 'test', '--console=plain'], { cwd: c.绝对(mod), env });
  if (r.退出码 !== 0) 收错(c, r.stdout + r.stderr, 报, 'gradle test', /FAILED|error:/);
};

export const 类型 = async (c: 检查上下文, 报: 报告) => {
  跑tsc(c, 报);
  if (c.文件().some((p) => p.endsWith('.py'))) {
    跑ruff(c, 报);
    跑pyright(c, 报);
  }
  跑gradle(c, 报);
};
