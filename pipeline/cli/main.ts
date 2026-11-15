import { oldNameError } from './旧名.ts';

// 旧的中文命令、参数先查掉（旧名.ts），快路径和完整路由都走这一处
const oldNames = oldNameError(process.argv.slice(2));
if (oldNames) {
    console.error(oldNames);
    process.exitCode = 2;
}
// 调度快路径不加载 Remotion、作品注册和全命令表；全局参数、帮助、调试走完整路由，行为才和别的命令一样。
else if (process.argv[2] === 'sched' && process.env.ANIM_DEBUG !== '1' && !process.argv.slice(3).some(a => /^(--work|--debug|--help|-h)(=.*)?$/.test(a))) {
    const { runScheduler, usage } = await import('../闸/命令.ts');
    const { UsageError: usageError } = await import('./参数.ts');
    try {
        process.exitCode = await runScheduler(process.argv.slice(3));
    }
    catch (e) {
        console.error(e instanceof usageError ? `${e.message}\n用法：anim ${usage}` : (e as Error).message);
        process.exitCode = e instanceof usageError ? 2 : 1;
    }
}
else
    await import('./全部命令.ts');
export {};
