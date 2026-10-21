package mcai;

import com.mojang.logging.LogUtils;
import mcai.mixin.StructureManagerAccessor;
import net.minecraft.core.Holder;
import net.minecraft.core.QuartPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeResolver;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGeneratorStructureState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureSet;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.placement.StructurePlacement;
import net.minecraftforge.event.server.ServerAboutToStartEvent;
import org.slf4j.Logger;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 大拼图结构所在的群系铺满整座结构（放大 4 倍的古城：地下那一层全是深暗之域）。给 mixin 包里的 `NoiseBasedChunkGeneratorMixin` 用。
 *
 * 为什么（用户 10-13「放大后的古城怎么没有幽匿地形了」）：原版古城里成片的幽匿块、幽匿脉络、感测体和尖啸体不是结构模板带的，是深暗之域群系的地物
 * （sculk_vein、sculk_patch_deep_dark，在 underground_decoration 这一步，排在古城放方块之后）；古城只要求起点在深暗之域。放大到 440 格后大半座城落在别的群系，那一大片就没有幽匿。
 *
 * 做法：区块的 BIOMES 这一步（`NoiseBasedChunkGenerator.doCreateBiomes`）换掉写进区块的群系：结构标签 mcai:fill_biome 里的大结构（只有一种允许群系的，远古城市就是 deep_dark），
 * 包围盒水平外扩 `MARGIN` 格、y 从世界底到 `Y_TOP`、且「在地下」（气候参数 depth ≥ `DEPTH_MIN`）的 4×4×4 群系格，写成这个结构要求的群系。
 *
 * 为什么地形、洞穴、结构一格不变（1.20.1 反编译核对过）：噪声地形、含水层、矿脉、洞穴噪声是 NoiseRouter 的密度函数，和群系无关；雕刻洞穴（carver）的 `applyCarvers` 直接问 biomeSource；
 * 结构起点按 biomeSource 判群系，拼图件不看群系；地表规则 `buildSurface` 读区块里的群系，但按群系分的那些全在 abovePreliminarySurface 里（地表往下 8 格内），depth ≥ 0.2 约在地表 25 格以下碰不到。
 * 只有地物（placed feature 的 biome 过滤、`applyBiomeDecoration` 收集的地物表）读区块里的群系：多出深暗之域的幽匿地物，少掉原来群系的地下地物（滴水石、苔藓、微光林地的……）。
 * 离线新旧逐格对比见 取材mod/手册.md「古城放大 4 倍」的「幽匿地形」。
 *
 * 只在世界的数据包里有结构标签 mcai:fill_biome 时起作用（取材mod/数据包/古城放大4倍 带；更早建的 古城放大-20260930 里的副本没有，照旧）。别的世界不受影响。
 */
public final class FillBiome {
    private static final Logger LOG = LogUtils.getLogger();

    public static final TagKey<Structure> TAG = TagKey.create(Registries.STRUCTURE, new ResourceLocation("mcai", "fill_biome"));
    /** 结构包围盒（`Structure.adjustBoundingBox` 以后，已含地形适配的 12 格）再水平外扩几格 */
    public static final int MARGIN = 32;
    /** 只换这个高度以下的群系格（格的底 ≤ Y_TOP）：城里最高的天然洞厅顶在 y 40 */
    public static final int Y_TOP = 44;
    /** 气候参数 depth（未量化）至少这么大才算地下：地表 depth ≈ 0，每往下 128 格加 1（原版洞穴群系 0.2～0.9，深暗之域 1.1） */
    public static final float DEPTH_MIN = 0.2F;

    /** 标签里的结构 → 要铺的群系（服务端启动时算，没有就是空） */
    private static volatile Map<Structure, Holder<Biome>> fill = Map.of();

    private FillBiome() {
    }

    public static void onServerAboutToStart(ServerAboutToStartEvent event) {
        Map<Structure, Holder<Biome>> m = new ConcurrentHashMap<>();
        var reg = event.getServer().registryAccess().registryOrThrow(Registries.STRUCTURE);
        reg.getTag(TAG).ifPresent(tag -> tag.forEach(h -> {
            Structure s = h.value();
            var key = h.unwrapKey().map(k -> k.location().toString()).orElse("?");
            if (s.biomes().size() != 1) {
                LOG.warn("铺满群系：{} 允许的群系有 {} 种，不知道铺哪种，跳过", key, s.biomes().size());
                return;
            }
            if (BigJigsaw.reach(s) <= BigJigsaw.VANILLA_REACH) {
                LOG.warn("铺满群系：{} 不是大拼图结构（没超出原版 8 个区块），跳过", key);
                return;
            }
            Holder<Biome> b = s.biomes().get(0);
            m.put(s, b);
            LOG.info("铺满群系：{} → {}（包围盒外扩 {} 格、y ≤ {}、depth ≥ {}）", key, b.unwrapKey().map(k -> k.location().toString()).orElse("?"),
                    MARGIN, Y_TOP, DEPTH_MIN);
        }));
        fill = m;
    }

    private record Box(int x0, int z0, int x1, int z1, Holder<Biome> biome) {
    }

    /**
     * `doCreateBiomes` 写群系前换上的解析器：这个区块碰不到要铺的结构就原样返回。
     * 结构起点照 `BigJigsaw.addFarReferences` 的路子找（按摆法算候选起点区块、起点走 BigJigsaw 的缓存），不靠区块里存的引用：外扩的那一圈不在包围盒里、没有引用，停服再开缓存也是空的。
     */
    public static BiomeResolver resolver(BiomeResolver orig, StructureManager sm, ChunkAccess chunk) {
        Map<Structure, Holder<Biome>> f = fill;
        if (f.isEmpty()) return orig;
        if (!(((StructureManagerAccessor) sm).mcai$level() instanceof WorldGenRegion region)) return orig;
        ServerLevel sl = region.getLevel();
        ChunkGeneratorStructureState state = sl.getChunkSource().getGeneratorState();
        ChunkPos cp = chunk.getPos();
        int cx0 = cp.getMinBlockX() - MARGIN, cz0 = cp.getMinBlockZ() - MARGIN, cx1 = cp.getMaxBlockX() + MARGIN, cz1 = cp.getMaxBlockZ() + MARGIN;
        List<Box> boxes = new ArrayList<>();
        for (Holder<StructureSet> set : state.possibleStructureSets()) {
            var entries = set.value().structures();
            if (entries.size() != 1) continue;
            Structure s = entries.get(0).structure().value();
            Holder<Biome> b = f.get(s);
            if (b == null) continue;
            StructurePlacement pl = set.value().placement();
            int r = BigJigsaw.reach(s) + Math.floorDiv(MARGIN + 15, 16);
            BigJigsaw.candidates(pl, state.getLevelSeed(), cp, r, c -> {
                if (!pl.isStructureChunk(state, c.x, c.z)) return;
                StructureStart st = BigJigsaw.start(sl, s, c);
                if (!st.isValid()) return;
                BoundingBox bb = st.getBoundingBox();
                if (bb.intersects(cx0, cz0, cx1, cz1)) {
                    boxes.add(new Box(bb.minX() - MARGIN, bb.minZ() - MARGIN, bb.maxX() + MARGIN, bb.maxZ() + MARGIN, b));
                }
            });
        }
        if (boxes.isEmpty()) return orig;
        long depthMin = Climate.quantizeCoord(DEPTH_MIN);
        return (qx, qy, qz, sampler) -> {
            int x = QuartPos.toBlock(qx), y = QuartPos.toBlock(qy), z = QuartPos.toBlock(qz);
            if (y <= Y_TOP) {
                for (Box bx : boxes) {
                    if (x + 3 >= bx.x0 && x <= bx.x1 && z + 3 >= bx.z0 && z <= bx.z1 && sampler.sample(qx, qy, qz).depth() >= depthMin) {
                        return bx.biome;
                    }
                }
            }
            return orig.getNoiseBiome(qx, qy, qz, sampler);
        };
    }
}
