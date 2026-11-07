package mcai;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.logging.LogUtils;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.QuartPos;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.chunk.ChunkStatus;
import net.minecraft.world.level.chunk.ProtoChunk;
import net.minecraft.world.level.chunk.UpgradeData;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.blending.Blender;
import org.slf4j.Logger;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 远景取样（`/mcai far <任务.json>`，服务端控制台发）：在服务端进程里直接调这个维度自己的生成器，只跑到地形那一步，
 * 照游戏的顺序 BIOMES（createBiomes）→ NOISE（fillFromNoise）→ SURFACE（buildSurface），不放结构、不长树、不跑雕刻器、不打光、不写存档。
 * 暮色森林的地形全在这几步里：噪声地形（TFTerrainWarp，按群系的 depth/scale）、地标附近起丘和压平、黑森林的硬化树冠、冰川、巨魔云（ChunkGeneratorTwilight 的 buildSurface）。
 * 一个区块用一份新建的 ProtoChunk，SURFACE 这一步的 WorldGenRegion 和游戏一样只有它自己（ChunkStatus.SURFACE 写半径 0，邻区块的群系照游戏回落到群系源现算），
 * 所以每个区块的结果和游戏生成那一刻的地形一样，和别的区块生没生成、按什么顺序无关。
 *
 * 任务（JSON）：{"维度": "...", "线程": n, "出": "<输出前缀>", "层": [{"名": "粗", "step": 32, "块边": 2048, "块": [[x0, z0], …]}]}
 *   每块 n×n 个点（n = 块边 / step + 1，含远边，和远景包加密层一样），点 (i, j) 是方块列 (x0 + i·step, z0 + j·step)，按块、块里 j 行 i 列排。
 * 输出：<出>.<名>.bin，每点 14 字节小端：int16 地面（最高的实心方块 y，不算黑森林树冠、云）、uint16 地面方块（下标进 方块名）、uint16 群系（地面那格的群系，下标进 群系名）、
 *   int16 水顶（地面上面最高的液体格，没有是 -32768）、int16 冠顶、int16 冠底（硬化黑森林树叶，没有是 -32768）、int16 云顶（巨魔云，没有是 -32768）；
 *   <出>.json：方块名、群系名、群系温度、各层点数、区块数、秒数。日志最后一行「mcai 远景：完成 <出>」（anim world server 的 wait: 认它）。
 */
public final class FarTerrain {
    private static final Logger LOG = LogUtils.getLogger();
    public static final short NONE = Short.MIN_VALUE;
    private static final int RECORD = 14;
    private static final Set<String> CANOPY = Set.of("twilightforest:hardened_dark_leaves");
    private static final Set<String> CLOUDS = Set.of("twilightforest:fluffy_cloud", "twilightforest:wispy_cloud", "twilightforest:rainy_cloud", "twilightforest:snowy_cloud");

    private FarTerrain() {
    }

    private record Layer(String name, int step, int tileSize, int n, int[][] tiles, ByteBuffer out) {
    }

    /** 区块里要取的一个点：层、在层输出里的第几个点、区块内坐标 */
    private record Point(int layer, int index, int lx, int lz) {
    }

    private static final class Palette {
        final Map<String, Integer> ids = new HashMap<>();
        final List<String> names = new ArrayList<>();

        synchronized int id(String name) {
            Integer i = ids.get(name);
            if (i == null) {
                i = names.size();
                names.add(name);
                ids.put(name, i);
            }
            return i;
        }
    }

    public static void start(MinecraftServer server, Path jobFile) throws IOException {
        JsonObject job = JsonParser.parseString(Files.readString(jobFile, StandardCharsets.UTF_8)).getAsJsonObject();
        ResourceKey<net.minecraft.world.level.Level> dim = ResourceKey.create(Registries.DIMENSION, new ResourceLocation(job.get("维度").getAsString()));
        ServerLevel level = server.getLevel(dim);
        if (level == null) throw new IOException("没有这个维度：" + dim.location());
        int threads = job.has("线程") ? job.get("线程").getAsInt() : Math.max(1, Runtime.getRuntime().availableProcessors() - 2);
        String outPrefix = job.get("出").getAsString();
        List<Layer> layers = new ArrayList<>();
        for (JsonElement e : job.getAsJsonArray("层")) {
            JsonObject o = e.getAsJsonObject();
            int step = o.get("step").getAsInt(), tileSize = o.get("块边").getAsInt();
            int n = tileSize / step + 1;
            JsonArray ts = o.getAsJsonArray("块");
            int[][] tiles = new int[ts.size()][];
            for (int t = 0; t < tiles.length; t++) {
                JsonArray a = ts.get(t).getAsJsonArray();
                tiles[t] = new int[]{a.get(0).getAsInt(), a.get(1).getAsInt()};
            }
            long points = (long) tiles.length * n * n;
            if (points * RECORD > Integer.MAX_VALUE) throw new IOException("层 " + o.get("名").getAsString() + " 点太多，拆成几次跑");
            layers.add(new Layer(o.get("名").getAsString(), step, tileSize, n, tiles, ByteBuffer.allocate((int) (points * RECORD)).order(ByteOrder.LITTLE_ENDIAN)));
        }
        Thread t = new Thread(() -> {
            try {
                run(level, layers, threads, outPrefix);
            } catch (Throwable ex) {
                LOG.error("mcai 远景：失败 {}", outPrefix, ex);
            }
        }, "mcai-远景");
        t.setDaemon(true);
        t.start();
    }

    private static void run(ServerLevel level, List<Layer> layers, int threads, String outPrefix) throws Exception {
        long t0 = System.nanoTime();
        // 点按区块分组：一个区块只生成一次，几层要的点都从它取
        HashMap<Long, List<Point>> byChunk = new HashMap<>();
        long totalPoints = 0;
        for (int li = 0; li < layers.size(); li++) {
            Layer L = layers.get(li);
            int idx = 0;
            for (int[] tile : L.tiles)
                for (int j = 0; j < L.n; j++)
                    for (int i = 0; i < L.n; i++, idx++) {
                        int x = tile[0] + i * L.step, z = tile[1] + j * L.step;
                        byChunk.computeIfAbsent(ChunkPos.asLong(x >> 4, z >> 4), k -> new ArrayList<>(4)).add(new Point(li, idx, x & 15, z & 15));
                    }
            totalPoints += idx;
        }
        // 按 32×32 区块的块排序，相邻区块挨着生成（群系层的缓存命中高）
        Long[] sorted = byChunk.keySet().toArray(new Long[0]);
        java.util.Arrays.sort(sorted, (a, b) -> {
            int ax = ChunkPos.getX(a), az = ChunkPos.getZ(a), bx = ChunkPos.getX(b), bz = ChunkPos.getZ(b);
            int c = Integer.compare(az >> 5, bz >> 5);
            if (c == 0) c = Integer.compare(ax >> 5, bx >> 5);
            if (c == 0) c = Integer.compare(az, bz);
            if (c == 0) c = Integer.compare(ax, bx);
            return c;
        });
        LOG.info("mcai 远景：开始 {}，{} 层 {} 点，{} 个区块，{} 线程", outPrefix, layers.size(), totalPoints, sorted.length, threads);
        Palette blocks = new Palette(), biomes = new Palette();
        ChunkGenerator gen = level.getChunkSource().getGenerator();
        RandomState random = level.getChunkSource().randomState();
        Registry<Biome> biomeRegistry = level.registryAccess().registryOrThrow(Registries.BIOME);
        ExecutorService pool = Executors.newFixedThreadPool(threads, r -> {
            Thread th = new Thread(r, "mcai-远景-工人");
            th.setDaemon(true);
            return th;
        });
        AtomicLong done = new AtomicLong();
        AtomicLong failed = new AtomicLong();
        long every = Math.max(1, sorted.length / 50);
        for (Long key : sorted) {
            pool.execute(() -> {
                try {
                    sampleChunk(level, gen, random, biomeRegistry, new ChunkPos(key), byChunk.get(key), layers, blocks, biomes);
                } catch (Throwable ex) {
                    if (failed.incrementAndGet() <= 5) LOG.error("mcai 远景：区块 {} 失败", new ChunkPos(key), ex);
                }
                long d = done.incrementAndGet();
                if (d % every == 0) {
                    double sec = (System.nanoTime() - t0) / 1e9;
                    LOG.info("mcai 远景：{}/{} 区块，{} 区块/秒，约剩 {} 秒", d, sorted.length, String.format("%.0f", d / sec), String.format("%.0f", (sorted.length - d) / (d / sec)));
                }
            });
        }
        pool.shutdown();
        pool.awaitTermination(7, TimeUnit.DAYS);
        if (failed.get() > 0) throw new IllegalStateException(failed.get() + " 个区块失败，不写结果");
        for (Layer L : layers) {
            try (OutputStream os = Files.newOutputStream(Path.of(outPrefix + "." + L.name + ".bin"))) {
                os.write(L.out.array());
            }
        }
        double sec = (System.nanoTime() - t0) / 1e9;
        JsonObject meta = new JsonObject();
        meta.addProperty("版本", 1);
        meta.addProperty("维度", level.dimension().location().toString());
        meta.addProperty("种子", Long.toString(level.getSeed()));
        meta.addProperty("海平面", gen.getSeaLevel());
        meta.addProperty("暮色地标网格", TwilightGrid.enabled ? TwilightGrid.GRID : 16);
        JsonArray ls = new JsonArray();
        for (Layer L : layers) {
            JsonObject o = new JsonObject();
            o.addProperty("名", L.name);
            o.addProperty("step", L.step);
            o.addProperty("块边", L.tileSize);
            o.addProperty("n", L.n);
            o.addProperty("块数", L.tiles.length);
            ls.add(o);
        }
        meta.add("层", ls);
        JsonArray bn = new JsonArray();
        blocks.names.forEach(bn::add);
        meta.add("方块名", bn);
        JsonArray gn = new JsonArray();
        biomes.names.forEach(gn::add);
        meta.add("群系名", gn);
        // 群系温度（Biome.getBaseTemperature，游戏里实际加载的群系），远景包按它判水面结冰（engine/voxel/远景群系.ts 的 waterFreezes）
        JsonArray gt = new JsonArray();
        for (String name : biomes.names) {
            Biome b = biomeRegistry.get(new ResourceLocation(name));
            gt.add(b == null ? 0.8f : b.getBaseTemperature());
        }
        meta.add("群系温度", gt);
        meta.addProperty("区块数", sorted.length);
        meta.addProperty("线程", threads);
        meta.addProperty("秒", Math.round(sec * 10) / 10.0);
        Files.writeString(Path.of(outPrefix + ".json"), meta.toString(), StandardCharsets.UTF_8);
        LOG.info("mcai 远景：完成 {}（{} 区块，{} 秒，{} 区块/秒）", outPrefix, sorted.length, String.format("%.1f", sec), String.format("%.0f", sorted.length / sec));
    }

    private static void sampleChunk(ServerLevel level, ChunkGenerator gen, RandomState random, Registry<Biome> biomeRegistry, ChunkPos pos, List<Point> points, List<Layer> layers, Palette blocks, Palette biomes) {
        ProtoChunk chunk = new ProtoChunk(pos, UpgradeData.EMPTY, level, biomeRegistry, null);
        gen.createBiomes(Runnable::run, random, Blender.empty(), level.structureManager(), chunk).join();
        chunk.setStatus(ChunkStatus.BIOMES);
        gen.fillFromNoise(Runnable::run, Blender.empty(), random, level.structureManager(), chunk).join();
        chunk.setStatus(ChunkStatus.NOISE);
        WorldGenRegion region = new WorldGenRegion(level, List.of(chunk), ChunkStatus.SURFACE, 0);
        gen.buildSurface(region, level.structureManager().forWorldGenRegion(region), random, chunk);
        int minY = chunk.getMinBuildHeight(), maxY = chunk.getMaxBuildHeight() - 1;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (Point pt : points) {
            short ground = NONE, water = NONE, canopyTop = NONE, canopyBottom = NONE, cloud = NONE;
            int groundBlock = 0;
            for (int y = maxY; y >= minY; y--) {
                p.set(pos.getMinBlockX() + pt.lx, y, pos.getMinBlockZ() + pt.lz);
                BlockState s = chunk.getBlockState(p);
                if (s.isAir()) continue;
                String id = BuiltInRegistries.BLOCK.getKey(s.getBlock()).toString();
                if (CLOUDS.contains(id)) {
                    if (cloud == NONE) cloud = (short) y;
                    continue;
                }
                if (CANOPY.contains(id)) {
                    if (canopyTop == NONE) canopyTop = (short) y;
                    canopyBottom = (short) y;
                    continue;
                }
                if (!s.getFluidState().isEmpty() && s.getBlock() instanceof net.minecraft.world.level.block.LiquidBlock) {
                    if (water == NONE) water = (short) y;
                    continue;
                }
                ground = (short) y;
                groundBlock = blocks.id(BlockStateParser.serialize(s));
                break;
            }
            // 群系取地面和水面高的那格：暮色的群系是三维的，河床、湖底往下就是 underground，取水底会把河湖报成地下
            int by = Math.max(ground == NONE ? minY : ground, water == NONE ? minY : water);
            Holder<Biome> b = chunk.getNoiseBiome(QuartPos.fromBlock(p.getX()), QuartPos.fromBlock(Math.max(minY, Math.min(maxY, by))), QuartPos.fromBlock(p.getZ()));
            int biome = biomes.id(b.unwrapKey().map(k -> k.location().toString()).orElse("?"));
            ByteBuffer out = layers.get(pt.layer).out;
            int o = pt.index * RECORD;
            out.putShort(o, ground);
            out.putShort(o + 2, (short) groundBlock);
            out.putShort(o + 4, (short) biome);
            out.putShort(o + 6, water);
            out.putShort(o + 8, canopyTop);
            out.putShort(o + 10, canopyBottom);
            out.putShort(o + 12, cloud);
        }
    }
}
