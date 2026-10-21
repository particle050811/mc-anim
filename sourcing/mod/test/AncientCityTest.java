import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import mcai.BigJigsaw;
import net.minecraft.SharedConstants;
import net.minecraft.core.Holder;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.RegistryDataLoader;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.packs.FilePackResources;
import net.minecraft.server.packs.PackResources;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.PathPackResources;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.util.datafix.DataFixers;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.MultiNoiseBiomeSource;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.PoolElementStructurePiece;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.structures.JigsawStructure;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager;
import net.minecraft.world.level.storage.LevelStorageSource;

import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Predicate;
import java.util.stream.Stream;

/**
 * 古城放大（mcai.BigJigsaw + 数据包 古城放大4倍）的离线核对，不开游戏：sh 测试/古城测试.sh [size:半径 ...]
 * 1. 编解码：原版 JSON 用原版 CODEC 和 `BigJigsaw.codec()` 读出来各字段一样；数据包的 ancient_city.json 原版读不进、放宽的读得进，除了 size、max_distance_from_center 其余和原版一字不差。
 * 2. 拼城：用游戏自己的代码按种子在起点区块拼一遍远古城市，报件数、范围、用时，每件模板和包围盒写成 JSON（给 参考模型库/工具/古城4x/ 画布局图、挑参数）；
 *    原版参数那次和片场存档里那座城的包围盒对照（古城.tsx 文件头）。群系判定用原版群系源（取材服务端还装了夸克等，地下群系可能有出入），离线只当参考，以游戏里 /locate 和存档为准。
 *
 * 用法：java AncientCityTest <原版数据 jar> <数据包目录> <种子> <起点区块 x> <起点区块 z> <输出目录> [size:半径 ...]
 */
public class AncientCityTest {
    static int checks, fails;

    static void check(boolean ok, String what) {
        checks++;
        if (!ok) {
            fails++;
            System.out.println("不对：" + what);
        }
    }

    static final RegistryAccess.Frozen BASE;

    static {
        SharedConstants.tryDetectVersion();
        try {
            Field f = net.minecraft.server.Bootstrap.class.getDeclaredField("isBootstrapped");
            f.setAccessible(true);
            f.setBoolean(null, true);
            Method m = BuiltInRegistries.class.getDeclaredMethod("bootStrap");
            m.setAccessible(true);
            m.invoke(null);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        BASE = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
    }

    static Object field(Object o, String name) throws ReflectiveOperationException {
        Field f = JigsawStructure.class.getDeclaredField(name);
        f.setAccessible(true);
        return f.get(o);
    }

    static final String[] FIELDS = {"startPool", "startJigsawName", "maxDepth", "startHeight", "useExpansionHack", "projectStartToHeightmap", "maxDistanceFromCenter"};

    public static void main(String[] a) throws Exception {
        Path vanillaJar = Path.of(a[0]), pack = Path.of(a[1]);
        long seed = Long.parseLong(a[2]);
        ChunkPos start = new ChunkPos(Integer.parseInt(a[3]), Integer.parseInt(a[4]));
        Path out = Path.of(a[5]);
        Files.createDirectories(out);

        List<PackResources> packs = List.of(new FilePackResources("vanilla", vanillaJar.toFile(), true));
        MultiPackResourceManager rm = new MultiPackResourceManager(PackType.SERVER_DATA, packs);
        RegistryAccess.Frozen wg = RegistryDataLoader.load(rm, BASE, RegistryDataLoader.WORLDGEN_REGISTRIES);
        RegistryAccess.Frozen ra = new RegistryAccess.ImmutableRegistryAccess(Stream.concat(BASE.registries(), wg.registries())).freeze();
        RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, ra);

        // 1. 编解码
        JsonObject vj = JsonParser.parseString(new String(rm.getResourceOrThrow(net.minecraft.resources.ResourceLocation.tryParse("minecraft:worldgen/structure/ancient_city.json")).open().readAllBytes())).getAsJsonObject();
        JigsawStructure byVanilla = JigsawStructure.CODEC.parse(ops, vj).getOrThrow(false, e -> {});
        JigsawStructure byWide = BigJigsaw.codec().parse(ops, vj).getOrThrow(false, e -> {});
        // HeightProvider 没有按内容比的 equals，比字符串（ConstantHeight 的 toString 就是数值）
        for (String f : FIELDS) check(String.valueOf(field(byVanilla, f)).equals(String.valueOf(field(byWide, f))), "原版 JSON 两种读法的 " + f + " 不一样");
        check(byVanilla.terrainAdaptation() == byWide.terrainAdaptation() && byVanilla.step() == byWide.step(), "原版 JSON 两种读法的结构设置不一样");
        Path pj = pack.resolve("data/minecraft/worldgen/structure/ancient_city.json");
        JsonObject packJson = JsonParser.parseString(Files.readString(pj)).getAsJsonObject();
        JsonObject rest = packJson.deepCopy(), vrest = vj.deepCopy();
        for (String k : new String[]{"size", "max_distance_from_center"}) {
            rest.remove(k);
            vrest.remove(k);
        }
        check(rest.equals(vrest), "数据包的 ancient_city.json 除了 size、max_distance_from_center 和原版不一样");
        check(JigsawStructure.CODEC.parse(ops, packJson).error().isPresent(), "原版 CODEC 居然读得进数据包的大数值（那就不用放宽了）");
        JigsawStructure big = BigJigsaw.codec().parse(ops, packJson).getOrThrow(false, e -> System.out.println("放宽的读不进：" + e));
        int packDepth = packJson.get("size").getAsInt(), packDist = packJson.get("max_distance_from_center").getAsInt();
        check((int) field(big, "maxDepth") == packDepth && (int) field(big, "maxDistanceFromCenter") == packDist, "数据包读出来的 size、半径不对");
        JsonObject tooBig = vj.deepCopy();
        tooBig.addProperty("max_distance_from_center", BigJigsaw.MAX_TOTAL_RANGE);
        check(BigJigsaw.codec().parse(ops, tooBig).error().isPresent(), "半径加地形适配超过 " + BigJigsaw.MAX_TOTAL_RANGE + " 也读进来了");
        check(BigJigsaw.reach(byVanilla) == BigJigsaw.VANILLA_REACH, "原版远古城市的引用半径不是 8");
        System.out.println("数据包：size " + packDepth + "、半径 " + packDist + " 格，引用半径 " + BigJigsaw.reach(big) + " 区块");

        // 2. 拼城
        Path tmp = Files.createTempDirectory("古城测试");
        LevelStorageSource.LevelStorageAccess storage = LevelStorageSource.createDefault(tmp).createAccess("t");
        StructureTemplateManager stm = new StructureTemplateManager(rm, storage, DataFixers.getDataFixer(), BuiltInRegistries.BLOCK.asLookup());
        var settings = ra.registryOrThrow(Registries.NOISE_SETTINGS).getHolderOrThrow(NoiseGeneratorSettings.OVERWORLD);
        var params = ra.registryOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST).getHolderOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD);
        NoiseBasedChunkGenerator gen = new NoiseBasedChunkGenerator(MultiNoiseBiomeSource.createFromPreset(params), settings);
        RandomState rs = RandomState.create(settings.value(), ra.lookupOrThrow(Registries.NOISE), seed);
        LevelHeightAccessor height = LevelHeightAccessor.create(-64, 384);
        Predicate<Holder<Biome>> deepDark = h -> h.is(Biomes.DEEP_DARK);

        List<String> runs = new ArrayList<>();
        runs.add("7:116");
        runs.add(packDepth + ":" + packDist);
        for (int i = 6; i < a.length; i++) runs.add(a[i]);
        Constructor<JigsawStructure> ctor = JigsawStructure.class.getConstructor(
                net.minecraft.world.level.levelgen.structure.Structure.StructureSettings.class, Holder.class, java.util.Optional.class, int.class,
                net.minecraft.world.level.levelgen.heightproviders.HeightProvider.class, boolean.class, java.util.Optional.class, int.class);
        Method settingsOf = net.minecraft.world.level.levelgen.structure.Structure.class.getDeclaredMethod("getModifiedStructureSettings");
        for (String run : runs) {
            int depth = Integer.parseInt(run.split(":")[0]), dist = Integer.parseInt(run.split(":")[1]);
            JigsawStructure s = ctor.newInstance(settingsOf.invoke(byVanilla), field(byVanilla, "startPool"), field(byVanilla, "startJigsawName"), depth,
                    field(byVanilla, "startHeight"), false, field(byVanilla, "projectStartToHeightmap"), dist);
            boolean biomeOk = true;
            long t0 = System.nanoTime();
            StructureStart st = s.generate(ra, gen, gen.getBiomeSource(), rs, stm, seed, start, 0, height, deepDark);
            if (!st.isValid()) {
                biomeOk = false; // 原版群系源下起点不在深暗之域：照样拼出来看布局
                st = s.generate(ra, gen, gen.getBiomeSource(), rs, stm, seed, start, 0, height, h -> true);
            }
            double sec = (System.nanoTime() - t0) / 1e9;
            BoundingBox b = st.getBoundingBox();
            System.out.printf("size %d、半径 %d：%d 件，范围 x %d～%d、z %d～%d、y %d～%d（%d×%d），用时 %.1f 秒%s%n", depth, dist, st.getPieces().size(),
                    b.minX(), b.maxX(), b.minZ(), b.maxZ(), b.minY(), b.maxY(), b.getXSpan(), b.getZSpan(), sec, biomeOk ? "" : "（原版群系源下起点不在深暗之域）");
            if (depth == 7 && dist == 116) {
                // 片场存档里那座（古城.tsx 文件头记的结构包围盒，不含地形适配外扩的 12 格）
                BoundingBox raw = BoundingBox.encapsulatingBoxes(st.getPieces().stream().map(StructurePiece::getBoundingBox).toList()).orElseThrow();
                check(raw.minX() == -826 && raw.maxX() == -609 && raw.minZ() == 131 && raw.maxZ() == 334,
                        "原版参数拼出来的城和片场存档里的对不上：" + raw);
            }
            StringBuilder sb = new StringBuilder("{\"size\":" + depth + ",\"dist\":" + dist + ",\"seconds\":" + sec + ",\"pieces\":[");
            boolean first = true;
            for (StructurePiece p : st.getPieces()) {
                BoundingBox pb = p.getBoundingBox();
                String el = p instanceof PoolElementStructurePiece pe ? pe.getElement().toString() : p.getClass().getSimpleName();
                String rot = p instanceof PoolElementStructurePiece pe ? pe.getRotation().name() : "";
                sb.append(first ? "" : ",").append("{\"el\":\"").append(el.replace("\"", "'")).append("\",\"rot\":\"").append(rot).append("\",\"depth\":").append(p.getGenDepth())
                        .append(",\"box\":[").append(pb.minX()).append(',').append(pb.minY()).append(',').append(pb.minZ()).append(',')
                        .append(pb.maxX()).append(',').append(pb.maxY()).append(',').append(pb.maxZ()).append("]}");
                first = false;
            }
            sb.append("]}");
            Files.writeString(out.resolve("城-" + depth + "-" + dist + ".json"), sb.toString());
        }
        // 3. 附近别的远古城市：放大以后包围盒会不会和这座叠上（原版结构之间不查碰撞，叠上就是两座城搅在一起）
        var set = ra.registryOrThrow(Registries.STRUCTURE_SET).getOrThrow(net.minecraft.resources.ResourceKey.create(Registries.STRUCTURE_SET,
                net.minecraft.resources.ResourceLocation.tryParse("minecraft:ancient_cities")));
        var pl = (net.minecraft.world.level.levelgen.structure.placement.RandomSpreadStructurePlacement) set.placement();
        int sp = pl.spacing(), reachChunks = (packDist + 12 + 64) / 16 * 2 + 4;
        for (int gx = Math.floorDiv(start.x - reachChunks, sp); gx <= Math.floorDiv(start.x + reachChunks, sp); gx++) {
            for (int gz = Math.floorDiv(start.z - reachChunks, sp); gz <= Math.floorDiv(start.z + reachChunks, sp); gz++) {
                ChunkPos c = pl.getPotentialStructureChunk(seed, gx * sp, gz * sp);
                if (c.equals(start)) continue;
                boolean valid = byVanilla.generate(ra, gen, gen.getBiomeSource(), rs, stm, seed, c, 0, height, deepDark).isValid();
                System.out.printf("附近的候选起点 区块 (%d, %d) = 方块 (%d, %d)，离这座 %.0f 格：%s%n", c.x, c.z, c.getMinBlockX(), c.getMinBlockZ(),
                        Math.hypot(c.x - start.x, c.z - start.z) * 16, valid ? "有城（原版群系源下）" : "没有");
            }
        }
        storage.close();
        System.out.println("古城离线核对" + (fails == 0 ? "全部通过" : "失败 " + fails + " 项") + "，共核对 " + checks + " 项");
        System.exit(fails == 0 ? 0 : 1);
    }
}
