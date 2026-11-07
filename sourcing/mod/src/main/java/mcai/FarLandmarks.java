package mcai;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.logging.LogUtils;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.chunk.ChunkGeneratorStructureState;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureSet;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;
import org.slf4j.Logger;
import twilightforest.util.LegacyLandmarkPlacements;
import twilightforest.world.components.structures.placements.BiomeForcedLandmarkPlacement;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 列出一片范围里的暮色地标（`/mcai landmarks <任务.json>`，服务端控制台发）：不自己重写选地标的规则，逐个地标网格中心问暮色自己的放置：
 * 每个结构集的放置是 `BiomeForcedLandmarkPlacement` 的，调它的 `isTFPlacementChunk`（和 /locate、结构起点用的是同一个判断：
 * 网格中心区块 → 那一点的群系 → dimension 文件的 landmark_placement_allowed_biomes，没登记的群系按 pickVarietyLandmark 抽签）。
 * 网格是 mcai 放大过的（TwilightGrid，64 区块，跟着 LegacyLandmarkPlacementsMixin 走），所以扫的是 `getNearestCenterXZ` 给的中心。
 * 放置选中后再照 ChunkGenerator.tryGenerateStructure 调结构自己的 generate（结构的 biomes 过滤、摆放点），isValid 才是游戏真会生成的。
 * 任务：{"维度": "...", "x0", "z0", "x1", "z1"（方块坐标）, "出": "<文件>"}。输出 JSON 数组，每项：结构、地标、中心（方块 x、z）、区块、群系、
 * 生成（true/false）、范围（生成的才有：结构外包框 [x0, y0, z0, x1, y1, z1]，补预生成小块按它定）。
 * 在服务端主线程上跑（群系和高度从生成器现算，不读不建区块），日志「mcai 地标：完成 <出>」。
 */
public final class FarLandmarks {
    private static final Logger LOG = LogUtils.getLogger();

    private FarLandmarks() {
    }

    public static void run(MinecraftServer server, Path jobFile) throws IOException {
        JsonObject job = JsonParser.parseString(Files.readString(jobFile, StandardCharsets.UTF_8)).getAsJsonObject();
        ServerLevel level = server.getLevel(ResourceKey.create(Registries.DIMENSION, new ResourceLocation(job.get("维度").getAsString())));
        if (level == null) throw new IOException("没有这个维度：" + job.get("维度").getAsString());
        int x0 = job.get("x0").getAsInt(), z0 = job.get("z0").getAsInt(), x1 = job.get("x1").getAsInt(), z1 = job.get("z1").getAsInt();
        ChunkGenerator gen = level.getChunkSource().getGenerator();
        ChunkGeneratorStructureState state = level.getChunkSource().getGeneratorState();
        int grid = TwilightGrid.enabled ? TwilightGrid.GRID : 16;
        JsonArray out = new JsonArray();
        int cells = 0;
        // 逐个网格（编号 r 的网格里取区块 r·grid，它的最近中心就是这一格的地标中心），中心落在范围里的才收
        int r0x = TwilightGrid.region((x0 >> 4) - grid, grid), r1x = TwilightGrid.region((x1 >> 4) + grid, grid);
        int r0z = TwilightGrid.region((z0 >> 4) - grid, grid), r1z = TwilightGrid.region((z1 >> 4) + grid, grid);
        for (int rz = r0z; rz <= r1z; rz++)
            for (int rx = r0x; rx <= r1x; rx++) {
                BlockPos center = LegacyLandmarkPlacements.getNearestCenterXZ(rx * grid, rz * grid);
                if (center.getX() < x0 || center.getX() > x1 || center.getZ() < z0 || center.getZ() > z1) continue;
                int ccx = center.getX() >> 4, ccz = center.getZ() >> 4;
                cells++;
                Holder<Biome> biome = gen.getBiomeSource().getNoiseBiome(ccx << 2, 64, ccz << 2, state.randomState().sampler());
                for (Holder<StructureSet> set : state.possibleStructureSets()) {
                    StructurePlacement placement = set.value().placement();
                    if (!(placement instanceof BiomeForcedLandmarkPlacement forced)) continue;
                    if (!forced.isTFPlacementChunk(gen, state, ccx, ccz)) continue;
                    for (StructureSet.StructureSelectionEntry e : set.value().structures()) {
                        // 再照 ChunkGenerator.tryGenerateStructure 问结构自己：结构的 biomes 不收这个群系、或摆不下，游戏就不生成
                        Structure st = e.structure().value();
                        StructureStart start = st.generate(level.registryAccess(), gen, gen.getBiomeSource(), state.randomState(), level.getStructureManager(),
                                state.getLevelSeed(), new ChunkPos(ccx, ccz), 0, level, st.biomes()::contains);
                        JsonObject o = new JsonObject();
                        o.addProperty("生成", start.isValid());
                        if (start.isValid()) {
                            BoundingBox bb = start.getBoundingBox();
                            JsonArray box = new JsonArray();
                            for (int v : new int[]{bb.minX(), bb.minY(), bb.minZ(), bb.maxX(), bb.maxY(), bb.maxZ()}) box.add(v);
                            o.add("范围", box);
                        }
                        o.addProperty("结构", e.structure().unwrapKey().map(k -> k.location().toString()).orElse("?"));
                        o.addProperty("地标", forced.getLandmark().name);
                        o.addProperty("x", center.getX());
                        o.addProperty("z", center.getZ());
                        o.addProperty("区块x", ccx);
                        o.addProperty("区块z", ccz);
                        o.addProperty("群系", biome.unwrapKey().map(k -> k.location().toString()).orElse("?"));
                        out.add(o);
                    }
                }
            }
        Files.writeString(Path.of(job.get("出").getAsString()), out.toString(), StandardCharsets.UTF_8);
        long valid = out.asList().stream().filter(e -> e.getAsJsonObject().get("生成").getAsBoolean()).count();
        LOG.info("mcai 地标：完成 {}（{} 个网格中心，选中 {} 座，生成 {} 座，网格 {} 区块）", job.get("出").getAsString(), cells, out.size(), valid, grid);
    }
}
