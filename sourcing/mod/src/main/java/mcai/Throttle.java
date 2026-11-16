package mcai;

/**
 * 空闲限帧（用户 11-15 定）：窗口藏着、没人用时，客户端照样按设置的帧率（默认 120）画世界，白占 CPU 和显卡。
 * 没有 mcai 请求在跑、最近 ACTIVE_MS 内也没收到过请求时，把帧率压到 IDLE_FPS；有请求就恢复，shoot、mesh、cam 等区块都按原帧率跑。
 * 压的是 Minecraft.getFramerateLimit 的返回值（MinecraftMixin），不改 options.txt：游戏存设置时不会把 10 帧写进去。
 * 客户端刻照常每秒 20 个（一帧补几刻），集成服务端在自己的线程上，不受帧率影响。input on（人在游戏里操作）时不限。
 */
public final class Throttle {
    public static final int IDLE_FPS = 10;
    /** 请求结束后再保持原帧率这么久：脚本里一条条发的 cam、shoot 之间隔着起 Python 的时间，cam 返回后区块网格也还在上传 */
    private static final long ACTIVE_MS = 5_000;

    private Throttle() {
    }

    public static int limit(int normal) {
        if (Input.enabled || IdleQuit.activeWithin(ACTIVE_MS)) return normal;
        return Math.min(normal, IDLE_FPS);
    }
}
