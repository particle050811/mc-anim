package mcai.gamedata;

/**
 * 判断一个方块的染色走哪一路，不用手写表：拿一个假世界去问游戏注册的染色函数（BlockColor），
 * 假世界被问到群系色时按问的是草、树叶、水还是别的，回一个约定好的暗号色；染色函数原样返回暗号的就是按群系取那一路。
 * 换一组暗号、换一个位置再问一次，结果不变的是定值，变了又不是暗号的是自己按位置或别的东西算的（暮色林冠叶、彩虹橡树叶）。
 *
 * 染色路的写法和手写方块表（sourcing/extract/关键帧方块.py 的 tint_route）一致：null 不染、grass、foliage、water、#rrggbb 定值；
 * 另加「动态:<染色函数类名>」，手写表里那几种按位置的近似（canopy、mangrove）在这里都归到动态。
 */
public final class TintProbe {
    private TintProbe() {
    }

    /** 两组暗号：[组][草, 树叶, 水, 别的取色函数]。挑游戏里不会自然出现的暗色 */
    public static final int[][] SENTINEL = {{0x0a0b01, 0x0a0b02, 0x0a0b03, 0x0a0b04}, {0x1c2d11, 0x1c2d12, 0x1c2d13, 0x1c2d14}};
    private static final String[] ROUTE = {"grass", "foliage", "water"};

    /** 用第 set 组暗号（假世界在第 set 个位置）问一次，返回染色函数给的颜色；没注册染色函数返回 -1 */
    public interface Probe {
        int color(int set);
    }

    public static String route(Probe probe, String dynamicName) {
        int first = probe.color(0);
        if (first == -1) return null;
        int a = first & 0xffffff;
        int b = probe.color(1) & 0xffffff;
        for (int i = 0; i < ROUTE.length; i++) {
            if (a == SENTINEL[0][i] && b == SENTINEL[1][i]) return ROUTE[i];
        }
        if (a == b) return String.format("#%06x", a);
        return "动态:" + dynamicName;
    }

    /** 假世界被问到 resolver 号取色函数（0 草、1 树叶、2 水、3 别的）时回的颜色 */
    public static int sentinel(int set, int resolver) {
        return SENTINEL[set][resolver];
    }
}
