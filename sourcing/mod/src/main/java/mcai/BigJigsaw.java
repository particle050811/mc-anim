package mcai;

import com.mojang.logging.LogUtils;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import mcai.mixin.JigsawStructureAccessor;
import net.minecraft.core.Holder;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.SectionPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.util.ExtraCodecs;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.chunk.ChunkGeneratorStructureState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.heightproviders.HeightProvider;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureSet;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.TerrainAdjustment;
import net.minecraft.world.level.levelgen.structure.placement.RandomSpreadStructurePlacement;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;
import net.minecraft.world.level.levelgen.structure.pools.StructureTemplatePool;
import net.minecraft.world.level.levelgen.structure.structures.JigsawStructure;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager;
import net.minecraftforge.event.server.ServerAboutToStartEvent;
import org.slf4j.Logger;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * 超出原版范围的大拼图结构（远古城市放大 4 倍，数据包 取材mod/数据包/古城放大4倍）。给 mixin 包里的 `JigsawStructureMixin`、
 * `ChunkGeneratorMixin`、`StructureManagerMixin`、`ChunkSerializerMixin` 用。
 *
 * 建筑保持原版尺寸，城的布局铺大到约 4 倍宽（拼图多拼几层、半径放大；用户 10-13 嫌古城太小）。原版 1.20.1 有四处把拼图结构卡在 8 个区块（128 格）以内：
 * 1. 编解码：`JigsawStructure.CODEC` 的 size 只收 0～7、max_distance_from_center 只收 1～128，`verifyRange` 要求半径 + 地形适配 12 格 ≤ 128。→ 换成 `codec()`：size 0～64，半径加地形适配 ≤ 1024。
 * 2. 引用：`ChunkGenerator.createReferences` 只看周围 8 个区块里的结构起点，更远的起点不记进区块，那里就不放这个结构的方块，地形也不让位。→ `addFarReferences` 再看到 reach 那么远。
 *    这一步拿不到更远的区块（那些区块可能还没算起点），所以不读邻居区块，而是照 `ChunkGenerator.tryGenerateStructure` 自己把起点算出来（同种子同区块，和起点区块里存的一样），存进 `start()` 的缓存。
 * 3. 取起点：之后 `Beardifier`（地形让位）和 `applyBiomeDecoration`（放方块）按引用回起点区块取结构，`StructureManager.fillStartsForStructure` 用 level.getChunk，
 *    起点区块在 8 个区块外就超出这一步的 `WorldGenRegion`，原版直接崩（We are asking a region for a chunk out of bound）。→ 拿不到时用 `farStart`，同样从缓存取（或现算）。
 * 4. 读存档：`ChunkSerializer.unpackStructureReferences` 把 8 个区块外的引用当坏数据丢掉，停服再开后没放完方块的区块就少了城的引用，城上留下缺口。→ `maxReach()` 以内的都留下。
 *
 * 只对「半径加地形适配超过 128 格」的拼图结构起作用（`reach()` > 8），原版和别的模组的结构读不进这么大的值，照旧走原版：旧存档、暮色世界、主世界都不受影响。
 * 没有改 `STRUCTURE_REFERENCES` 等几步的邻居范围（`ChunkStatus` 写死的 8）：改了所有区块都要多等一大圈邻居先算起点，还要动区块票的等级上限。离线核对见 取材mod/测试/古城测试.sh。
 */
public final class BigJigsaw {
    private static final Logger LOG = LogUtils.getLogger();

    /** 放宽后的上限：size（拼几层）、max_distance_from_center 加地形适配（格） */
    public static final int MAX_DEPTH = 64;
    public static final int MAX_TOTAL_RANGE = 1024;
    /** 原版的引用半径（区块） */
    public static final int VANILLA_REACH = 8;
    /**
     * 拼图的范围框以起始件中心为心（`JigsawPlacement.addPieces`），起始件按 start_jigsaw_name 的拼图块对到起点区块的角上，
     * 所以起始件中心离角最远是起始件的边长；远古城市的城心件 18×31×41，取 64 格宽裕
     */
    static final int START_SLACK = 64;

    private static volatile int maxReach = VANILLA_REACH;

    private BigJigsaw() {
    }

    /** 放宽范围的 JigsawStructure 编解码，字段和原版一一对应（JigsawStructureMixin 在类初始化的最后换上） */
    public static Codec<JigsawStructure> codec() {
        return ExtraCodecs.validate(RecordCodecBuilder.<JigsawStructure>mapCodec(i -> i.group(
                Structure.settingsCodec(i),
                StructureTemplatePool.CODEC.fieldOf("start_pool").forGetter(s -> acc(s).mcai$startPool()),
                ResourceLocation.CODEC.optionalFieldOf("start_jigsaw_name").forGetter(s -> acc(s).mcai$startJigsawName()),
                Codec.intRange(0, MAX_DEPTH).fieldOf("size").forGetter(s -> acc(s).mcai$maxDepth()),
                HeightProvider.CODEC.fieldOf("start_height").forGetter(s -> acc(s).mcai$startHeight()),
                Codec.BOOL.fieldOf("use_expansion_hack").forGetter(s -> acc(s).mcai$useExpansionHack()),
                Heightmap.Types.CODEC.optionalFieldOf("project_start_to_heightmap").forGetter(s -> acc(s).mcai$projectStartToHeightmap()),
                Codec.intRange(1, MAX_TOTAL_RANGE).fieldOf("max_distance_from_center").forGetter(s -> acc(s).mcai$maxDistanceFromCenter())
        ).apply(i, JigsawStructure::new)), BigJigsaw::verifyRange).codec();
    }

    private static JigsawStructureAccessor acc(JigsawStructure s) {
        return (JigsawStructureAccessor) (Object) s;
    }

    /** 照原版 JigsawStructure.verifyRange，上限从 128 换成 MAX_TOTAL_RANGE */
    static DataResult<JigsawStructure> verifyRange(JigsawStructure s) {
        return range(s) + padding(s) > MAX_TOTAL_RANGE
                ? DataResult.error(() -> "Structure size including terrain adaptation must not exceed " + MAX_TOTAL_RANGE)
                : DataResult.success(s);
    }

    /** 地形适配往外让的格数（Structure.adjustBoundingBox 把包围盒外扩这么多，Beardifier 也看这么远） */
    public static int padding(Structure s) {
        return s.terrainAdaptation() == TerrainAdjustment.NONE ? 0 : 12;
    }

    /** max_distance_from_center；不是拼图结构返回 0 */
    public static int range(Structure s) {
        if (!(s instanceof JigsawStructure j)) return 0;
        try {
            return acc(j).mcai$maxDistanceFromCenter();
        } catch (ClassCastException e) { // 离线测试（取材mod/测试/古城测试.sh）没织 mixin，按 Mojmap 字段名反射取
            try {
                var f = JigsawStructure.class.getDeclaredField("maxDistanceFromCenter");
                f.setAccessible(true);
                return f.getInt(j);
            } catch (ReflectiveOperationException e2) {
                throw new IllegalStateException(e2);
            }
        }
    }

    /** 这个结构的件最远会落到起点区块几个区块外（切比雪夫距离）。原版的拼图结构半径加地形适配不超过 128 格，返回 8 */
    public static int reach(Structure s) {
        int r = range(s) + padding(s);
        if (r <= 128) return VANILLA_REACH;
        return Math.floorDiv(r + START_SLACK + 15, 16) + 1;
    }

    /** 读存档时留下多远的引用（ChunkSerializerMixin）：当前服务端世界里各结构 reach 的最大值，没有大结构时是 8 */
    public static int maxReach() {
        return maxReach;
    }

    /** 服务端开始加载世界之前（早于读区块、生成区块）按这个世界的结构注册表算 maxReach，日志里打出哪些结构放宽了 */
    public static void onServerAboutToStart(ServerAboutToStartEvent event) {
        int max = VANILLA_REACH;
        var reg = event.getServer().registryAccess().registryOrThrow(Registries.STRUCTURE);
        for (var e : reg.entrySet()) {
            int r = reach(e.getValue());
            if (r > VANILLA_REACH) {
                JigsawStructure j = (JigsawStructure) e.getValue();
                LOG.info("大拼图结构：{} size {}、半径 {} 格，引用半径 {} 区块", e.getKey().location(), acc(j).mcai$maxDepth(), range(j), r);
                max = Math.max(max, r);
            }
        }
        maxReach = max;
        CACHE.clear();
    }

    // ---- 起点缓存 ----

    private record Key(Structure structure, long chunk) {
    }

    /** 每个世界（按它的 RandomState 分）各一份：起点区块 → 起点（无效的也存，存 StructureStart.INVALID_START） */
    private static final Map<RandomState, Map<Key, StructureStart>> CACHE = Collections.synchronizedMap(new WeakHashMap<>());

    /**
     * 照 ChunkGenerator.tryGenerateStructure 算某个区块里这个结构的起点（不写进区块），算过的直接返回同一个对象。
     * 同一个起点同时只算一次（别的线程等着），算一座 4 倍的古城要几秒。
     */
    public static StructureStart start(RegistryAccess ra, ChunkGenerator gen, RandomState rs, StructureTemplateManager stm, long seed,
                                       Structure s, ChunkPos pos, LevelHeightAccessor height) {
        Map<Key, StructureStart> m = CACHE.computeIfAbsent(rs, k -> new ConcurrentHashMap<>());
        return m.computeIfAbsent(new Key(s, pos.toLong()), k -> {
            long t0 = System.nanoTime();
            StructureStart st = s.generate(ra, gen, gen.getBiomeSource(), rs, stm, seed, pos, 0, height, s.biomes()::contains);
            if (st.isValid()) {
                BoundingBox b = st.getBoundingBox();
                LOG.info("大拼图结构起点 {}（区块 {}）：{} 件，范围 x {}～{}、z {}～{}，算了 {} 毫秒", ra.registryOrThrow(Registries.STRUCTURE).getKey(s),
                        pos, st.getPieces().size(), b.minX(), b.maxX(), b.minZ(), b.maxZ(), (System.nanoTime() - t0) / 1_000_000);
            }
            return st;
        });
    }

    static StructureStart start(ServerLevel level, Structure s, ChunkPos pos) {
        var src = level.getChunkSource();
        return start(level.registryAccess(), src.getGenerator(), src.randomState(), level.getStructureManager(),
                src.getGeneratorState().getLevelSeed(), s, pos, level);
    }

    /** ChunkGenerator.tryGenerateStructure 里算起点的那一下（ChunkGeneratorMixin）：大结构走缓存，和 addFarReferences 算的是同一个对象 */
    public static StructureStart generate(Structure s, RegistryAccess ra, ChunkGenerator gen, RandomState rs, StructureTemplateManager stm,
                                          long seed, ChunkPos pos, LevelHeightAccessor height) {
        return start(ra, gen, rs, stm, seed, s, pos, height);
    }

    /**
     * 接在 ChunkGenerator.createReferences 原版那一圈（8 个区块）后面：再往外到 reach，把包围盒碰到这个区块的大结构起点记进区块。
     * 只认一个结构集里只有一种结构的（远古城市就是），有几种的要照原版按权重抽，没做。
     */
    public static void addFarReferences(WorldGenLevel level, StructureManager sm, ChunkAccess chunk) {
        if (!(level instanceof WorldGenRegion region)) return;
        ServerLevel sl = region.getLevel();
        ChunkGeneratorStructureState state = sl.getChunkSource().getGeneratorState();
        ChunkPos cp = chunk.getPos();
        int x0 = cp.getMinBlockX(), z0 = cp.getMinBlockZ();
        SectionPos sec = SectionPos.bottomOf(chunk);
        for (Holder<StructureSet> set : state.possibleStructureSets()) {
            List<StructureSet.StructureSelectionEntry> entries = set.value().structures();
            int r = entries.stream().mapToInt(e -> reach(e.structure().value())).max().orElse(VANILLA_REACH);
            if (r <= VANILLA_REACH) continue;
            if (entries.size() != 1) {
                warnOnce(set);
                continue;
            }
            Structure s = entries.get(0).structure().value();
            StructurePlacement pl = set.value().placement();
            candidates(pl, state.getLevelSeed(), cp, r, c -> {
                if (Math.max(Math.abs(c.x - cp.x), Math.abs(c.z - cp.z)) <= VANILLA_REACH) return; // 原版那一圈已经查过
                if (!pl.isStructureChunk(state, c.x, c.z)) return;
                StructureStart st = start(sl, s, c);
                if (st.isValid() && st.getBoundingBox().intersects(x0, z0, x0 + 15, z0 + 15)) {
                    sm.addReferenceForStructure(sec, s, c.toLong(), chunk);
                }
            });
        }
    }

    /** cp 周围 r 个区块（切比雪夫距离）里这种摆法可能放起点的区块。随机散布每个大格只有一个候选，直接算；别的摆法逐个区块交给 isStructureChunk 判 */
    static void candidates(StructurePlacement pl, long seed, ChunkPos cp, int r, Consumer<ChunkPos> out) {
        if (pl instanceof RandomSpreadStructurePlacement rs) {
            int sp = rs.spacing();
            for (int gx = Math.floorDiv(cp.x - r, sp); gx <= Math.floorDiv(cp.x + r, sp); gx++) {
                for (int gz = Math.floorDiv(cp.z - r, sp); gz <= Math.floorDiv(cp.z + r, sp); gz++) {
                    ChunkPos c = rs.getPotentialStructureChunk(seed, gx * sp, gz * sp);
                    if (Math.abs(c.x - cp.x) <= r && Math.abs(c.z - cp.z) <= r) out.accept(c);
                }
            }
            return;
        }
        for (int x = cp.x - r; x <= cp.x + r; x++) {
            for (int z = cp.z - r; z <= cp.z + r; z++) out.accept(new ChunkPos(x, z));
        }
    }

    private static final Map<Holder<StructureSet>, Boolean> WARNED = new ConcurrentHashMap<>();

    private static void warnOnce(Holder<StructureSet> set) {
        if (WARNED.putIfAbsent(set, true) == null) {
            LOG.warn("大拼图结构所在的结构集 {} 里有几种结构，超出 8 个区块的部分不生成（只做了一种结构的结构集）", set.unwrapKey().map(Object::toString).orElse("?"));
        }
    }

    /**
     * StructureManager.fillStartsForStructure 里起点区块不在这一步的 WorldGenRegion 里（StructureManagerMixin）：
     * 大结构从缓存取起点（缓存里没有就现算，和起点区块存的一样）；不是大结构的不该出现这种引用，跳过。
     */
    public static StructureStart farStart(WorldGenRegion region, Structure s, ChunkPos pos) {
        if (reach(s) <= VANILLA_REACH) return null;
        return start(region.getLevel(), s, pos);
    }
}
