package mcai.gamedata.forge1201;

import mcai.gamedata.BiomeSource;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.BiomeColors;
import net.minecraft.core.registries.Registries;
import net.minecraft.util.Mth;
import net.minecraft.world.level.ColorResolver;
import net.minecraft.world.level.FoliageColor;
import net.minecraft.world.level.GrassColor;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeSpecialEffects;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 群系色（Forge 1.20.1）：取色直接调 BiomeColors 的三个 ColorResolver，游戏渲染方块染色时也是它们（只是外面多一层邻格混色，取材时关掉了）。
 * 暮色森林的 coremod（foliage.js）把树叶色钩子插在树叶那个 ColorResolver 的方法体里，所以调它就带上了。
 * 群系取客户端世界的注册表：单人世界里和服务端是同一份，Forge 的群系修改器（ModifiableBiomeInfo）已经算进去。
 */
final class ForgeBiomes implements BiomeSource {
    private final Map<String, Biome> biomes = new TreeMap<>();

    ForgeBiomes(ClientLevel level) {
        for (var e : level.registryAccess().registryOrThrow(Registries.BIOME).entrySet()) {
            biomes.put(e.getKey().location().toString(), e.getValue());
        }
    }

    public List<String> ids() {
        return new ArrayList<>(biomes.keySet());
    }

    public Info info(String id) {
        Biome b = biomes.get(id);
        Biome.ClimateSettings c = b.getModifiedClimateSettings();
        BiomeSpecialEffects fx = b.getModifiedSpecialEffects();
        // 同 Biome.getGrassColorFromTexture / getFoliageColorFromTexture：温度、降水夹到 0～1 查色图
        double t = Mth.clamp(c.temperature(), 0.0F, 1.0F), d = Mth.clamp(c.downfall(), 0.0F, 1.0F);
        int grassBase = fx.getGrassColorOverride().orElseGet(() -> GrassColor.get(t, d));
        int foliageBase = fx.getFoliageColorOverride().orElseGet(() -> FoliageColor.get(t, d));
        return new Info(c.temperature(), c.downfall(), c.hasPrecipitation(), c.temperatureModifier().getSerializedName(),
                fx.getSkyColor(), fx.getFogColor(), fx.getWaterColor(), fx.getWaterFogColor(),
                fx.getGrassColorOverride().orElse(null), fx.getFoliageColorOverride().orElse(null), fx.getGrassColorModifier().getSerializedName(),
                grassBase, foliageBase);
    }

    public int color(String id, Channel channel, int x, int z) {
        ColorResolver r = switch (channel) {
            case GRASS -> BiomeColors.GRASS_COLOR_RESOLVER;
            case FOLIAGE -> BiomeColors.FOLIAGE_COLOR_RESOLVER;
            case WATER -> BiomeColors.WATER_COLOR_RESOLVER;
        };
        return r.getColor(biomes.get(id), x, z);
    }
}
