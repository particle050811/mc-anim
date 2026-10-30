package mcai.gamedata;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 群系色表：和手写的 群系色.json（sourcing/extract/关键帧方块.py 的 biome_colors）同结构，多出天空、雾、气候和采样。
 * 草、叶、水：在固定的一批采样点上问游戏的取色函数；各点都一样就是定值，不一样的记「草随位置 / 叶随位置」和各点的颜色，
 * 这时 草 / 叶 写修饰之前的底色，并照手写表的约定写 草修饰（草色修饰的序列化名，原版的不带命名空间，补成 minecraft:swamp）/ 叶修饰（群系 id，暮色的树叶色钩子按群系改），
 * engine/voxel/群系色.ts 照这两个键挑复刻好的规则；表里出现它没复刻的修饰时要先补规则。
 */
public final class BiomeTable {
    private BiomeTable() {
    }

    /** 采样点（方块坐标 x, z）：原点附近几个，加一批固定的伪随机点（±20000 内）。同一版本重导结果不变 */
    public static int[][] samplePoints(int count) {
        List<int[]> pts = new ArrayList<>(List.of(new int[]{0, 0}, new int[]{8, -8}, new int[]{-300, 77}, new int[]{1000, 1000}));
        long s = 20261030L;
        while (pts.size() < count) {
            s = s * 6364136223846793005L + 1442695040888963407L;
            int x = (int) Math.floorMod(s >>> 20, 40000L) - 20000;
            s = s * 6364136223846793005L + 1442695040888963407L;
            int z = (int) Math.floorMod(s >>> 20, 40000L) - 20000;
            pts.add(new int[]{x, z});
        }
        return pts.subList(0, count).toArray(new int[0][]);
    }

    public static JsonObject build(GameData game, BiomeSource src, int sampleCount, JsonObject params) {
        int[][] pts = samplePoints(sampleCount);
        JsonObject out = new JsonObject();
        out.addProperty("说明", "mcai biomes 从游戏里导出的群系色（取色函数在采样点上的值），不要手改；结构和规则见 docs/游戏导表.md");
        out.add("取材", provenance(game, params));
        JsonArray ptsJson = new JsonArray();
        for (int[] p : pts) ptsJson.add(pair(p[0], p[1]));
        out.add("采样点", ptsJson);
        JsonObject biomes = new JsonObject();
        for (String id : src.ids()) {
            BiomeSource.Info info = src.info(id);
            int[] grass = sample(src, id, BiomeSource.Channel.GRASS, pts);
            int[] leaf = sample(src, id, BiomeSource.Channel.FOLIAGE, pts);
            int[] water = sample(src, id, BiomeSource.Channel.WATER, pts);
            boolean grassVaries = varies(grass), leafVaries = varies(leaf);
            JsonObject b = new JsonObject();
            b.addProperty("草", hex(grassVaries ? info.grassBase() : grass[0]));
            b.addProperty("叶", hex(leafVaries ? info.foliageBase() : leaf[0]));
            b.addProperty("水", hex(water[0]));
            if (grassVaries) b.addProperty("草修饰", modifierId(info.grassModifier()));
            if (leafVaries) b.addProperty("叶修饰", id);
            b.addProperty("天空", hex(info.sky()));
            b.addProperty("雾", hex(info.fog()));
            b.addProperty("水雾", hex(info.waterFog()));
            b.addProperty("温度", info.temperature());
            b.addProperty("降水量", info.downfall());
            b.addProperty("降水", info.precipitation());
            if (!"none".equals(info.temperatureModifier())) b.addProperty("温度修正", info.temperatureModifier());
            if (!"none".equals(info.grassModifier())) b.addProperty("草修饰名", modifierId(info.grassModifier()));
            if (info.grassOverride() != null) b.addProperty("草覆盖", hex(info.grassOverride()));
            if (info.foliageOverride() != null) b.addProperty("叶覆盖", hex(info.foliageOverride()));
            // 原版和现有模组的水色都不随位置变；真遇上了记下来，手写表的结构里没有这一项
            if (varies(water)) b.addProperty("水随位置", true);
            if (grassVaries || leafVaries || varies(water)) {
                JsonObject samples = new JsonObject();
                if (grassVaries) samples.add("草", hexes(grass));
                if (leafVaries) samples.add("叶", hexes(leaf));
                if (varies(water)) samples.add("水", hexes(water));
                b.add("采样", samples);
            }
            biomes.add(id, b);
        }
        out.add("群系", biomes);
        return out;
    }

    static JsonObject provenance(GameData game, JsonObject params) {
        JsonObject p = new JsonObject();
        p.addProperty("游戏", game.gameVersion());
        JsonObject mods = new JsonObject();
        game.mods().forEach(mods::addProperty);
        p.add("模组", mods);
        JsonArray packs = new JsonArray();
        game.resourcePacks().forEach(packs::add);
        p.add("资源包", packs);
        p.add("参数", params == null ? new JsonObject() : params);
        return p;
    }

    private static int[] sample(BiomeSource src, String id, BiomeSource.Channel ch, int[][] pts) {
        int[] out = new int[pts.length];
        for (int i = 0; i < pts.length; i++) out[i] = src.color(id, ch, pts[i][0], pts[i][1]) & 0xffffff;
        return out;
    }

    private static boolean varies(int[] v) {
        for (int c : v) if (c != v[0]) return true;
        return false;
    }

    static String modifierId(String name) {
        return name.indexOf(':') < 0 ? "minecraft:" + name : name;
    }

    static String hex(int c) {
        return String.format("#%06x", c & 0xffffff);
    }

    private static JsonArray hexes(int[] v) {
        JsonArray a = new JsonArray();
        for (int c : v) a.add(hex(c));
        return a;
    }

    private static JsonArray pair(int a, int b) {
        JsonArray p = new JsonArray();
        p.add(a);
        p.add(b);
        return p;
    }
}
