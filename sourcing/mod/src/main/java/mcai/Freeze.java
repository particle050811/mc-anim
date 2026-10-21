package mcai;

/**
 * 冻结开关。1.20.1 没有原生 /tick freeze，由 mixin 包里的几个注入点照着 1.20.3 的做法实现：
 * 只跳过服务端世界里的时间、天气、计划刻、随机刻、方块实体、非玩家实体、刷怪，
 * 玩家自己的 tick 和区块加载/下发照常，所以冻结后还能移动机位、加载新区块。
 * 不用 ESC 暂停，是因为那会让集成服务端整个停下，区块不再加载。
 */
public final class Freeze {
    public static volatile boolean frozen;

    private Freeze() {
    }
}
