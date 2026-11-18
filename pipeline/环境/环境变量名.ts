// 环境里读不回来的变量名：Node 列得出名字、按这个名字却取不到。名字不是合法 UTF-8 就会这样（Node 把坏字节换成 U+FFFD 再去查，对不上原字节）。
// 为什么要拦：Node 24.19.0（main 分支同）起默认 env 的 Worker 时要复制 process.env，碰到取不到的名字复制失败，线程照起、拿着空的环境表，
// 进程段错误退出 139、没有任何输出（src/node_worker.cc 的 Worker::New 抛错后没 return，src/node_env_var.cc 的 KVStore::Clone 返回空）。
// module.register 也起这样的 Worker，anim 一进 别名注册.ts 就崩。
// 怎么来的：zsh 5.9（master 同）导出变量时名字按内部编码原样写进环境（Src/params.c 的 mkenvstr），0x83～0xA2 的字节前面多一个 0x83、自己异或 0x20；
// 常用汉字四分之三带这种字节，`临时无损=1 ./anim …` 传进来的名字就坏了，程序按原名也读不到。值不受影响，`env 中文名=值 命令` 传的是原字节。
// JS 删不掉这种变量（删也是按换过的名字去删），所以只报错、不往下跑。纯模块：入口 main.ts 在加载别的东西之前就引它。

/** Node 列得出、却取不到的环境变量名（坏字节已被换成 U+FFFD，不是原名） */
export const unreadableEnvNames = (env: NodeJS.ProcessEnv = process.env): string[] => Object.getOwnPropertyNames(env).filter((name) => !(name in env));

/** 有读不回来的变量名时的报错文本，没有返回 null */
export const unreadableEnvError = (names: readonly string[] = unreadableEnvNames()): string | null =>
  names.length === 0
    ? null
    : [
        `环境里有 ${names.length} 个变量的名字读不回来（不是合法 UTF-8，下面是坏了以后的样子）：${names.map((name) => `「${name}」`).join('、')}`,
        '这种环境下 Node 一起 Worker 线程就段错误（退出码 139、没有输出），所以不往下跑。',
        '多半是在 zsh 里写了「中文名=值 命令」或 export 了中文名的变量：zsh 把名字的字节写坏了，程序按原名也读不到它。',
        '改法：变量名用英文；一定要中文名就写 env 中文名=值 ./anim …',
      ].join('\n');
