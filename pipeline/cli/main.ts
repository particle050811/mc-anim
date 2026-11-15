// 调度快路径不加载 Remotion、作品注册和全命令表；全局参数、帮助、调试走完整路由，行为才和别的命令一样。
if (process.argv[2] === '调度' && process.env.ANIM_DEBUG !== '1' && !process.argv.slice(3).some(a => /^(--作品|--调试|--help|-h)(=.*)?$/.test(a))) {
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
