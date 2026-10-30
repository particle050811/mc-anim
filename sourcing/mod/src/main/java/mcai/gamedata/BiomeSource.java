package mcai.gamedata;

import java.util.List;

/** 取群系色。颜色一律 0xRRGGBB（sRGB，不带 alpha）。 */
public interface BiomeSource {
    enum Channel { GRASS, FOLIAGE, WATER }

    /** 当前世界注册的全部群系 id，排好序 */
    List<String> ids();

    Info info(String id);

    /**
     * 游戏自己的取色函数（1.20.1 是 BiomeColors 的三个 ColorResolver）在方块坐标 (x, z) 给的颜色，
     * 和位置有关的修饰（沼泽草色噪声）、模组插进去的钩子（暮色树叶色）都在里面。不做相邻群系的混色。
     */
    int color(String id, Channel channel, int x, int z);

    /**
     * 群系里的定值。grassBase、foliageBase 是修饰之前的底色：写了覆盖色用覆盖色，没写按温度、降水查色图。
     * grassModifier 是草色修饰的序列化名（none 表示没有）。
     */
    record Info(float temperature, float downfall, boolean precipitation, String temperatureModifier,
                int sky, int fog, int water, int waterFog,
                Integer grassOverride, Integer foliageOverride, String grassModifier,
                int grassBase, int foliageBase) {
    }
}
