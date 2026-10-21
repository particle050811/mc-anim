package mcai;

import com.mojang.logging.LogUtils;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.event.server.ServerAboutToStartEvent;
import org.slf4j.Logger;
import twilightforest.init.TFLandmark;

import java.util.Random;

/**
 * 暮色森林放大 4 倍（B4）的地标网格，给 mixin 包里的 `LegacyLandmarkPlacementsMixin`、`ChunkGeneratorTwilightMixin`、
 * `FinalCastleStructureMixin`、`FinalCastleMazeTower13ComponentMixin` 用。
 * 群系由数据包 `取材mod/数据包/暮色放大4倍/` 放大；地标摆在暮色写死的 16 区块网格上（`LegacyLandmarkPlacements`），数据包管不到，
 * 只放大群系的话一个关键群系里会落进十几个网格点，同一种首领建筑重复十几座。所以把网格也放大到 64 区块，
 * 网格中心相对网格点的抖动跟着乘 4，得到原版布局整体放大 4 倍；建筑本身不放大。
 * 只对装了这个数据包的世界生效（认数据包里的标记文件）：旧片场存档在镜头飞到没生成过的地方时，集成服务端要照原版 16 区块网格补生成，才能和已有区块对上。
 * `nearestCenter`、`varietyLandmark` 是暮色 4.3.2508 原函数的照抄，只把 16 换成 grid；grid = 16 时和原函数逐值相同，`withinRange` 也是照抄
 * （都由 取材mod/测试/TwilightGridTest.java 核对）。
 */
public final class TwilightGrid {
    private static final Logger LOG = LogUtils.getLogger();

    /** 数据包里的 data/mcai/twilight_x4.json */
    private static final ResourceLocation MARKER = ResourceLocation.fromNamespaceAndPath("mcai", "twilight_x4.json");

    /** 放大后的地标网格边长（区块），原版 16 */
    public static final int GRID = 64;

    /** 当前服务端（专用服务端，或客户端的集成服务端）的世界要不要放大。每次服务端启动重新判断，换存档不会串 */
    public static volatile boolean enabled;

    private TwilightGrid() {
    }

    /** 服务端开始加载世界之前触发，早于任何区块生成；这时数据包已经读进来了 */
    public static void onServerAboutToStart(ServerAboutToStartEvent event) {
        enabled = event.getServer().getResourceManager().getResource(MARKER).isPresent();
        LOG.info("暮色地标网格：{} 区块", enabled ? GRID : 16);
    }

    /** 区块坐标取整到最近的网格点。原版 Math.round(c / 16f) * 16 */
    public static int round(int chunk, int grid) {
        return Math.round((float) chunk / grid) * grid;
    }

    /** 区块所在网格的编号。原版 (c + 8) >> 4 */
    public static int region(int chunk, int grid) {
        return chunk + grid / 2 >> Integer.numberOfTrailingZeros(grid);
    }

    /** 照 LegacyLandmarkPlacements.getNearestCenterXZ(int, int, int)：区块所在网格的地标中心（方块坐标） */
    public static BlockPos nearestCenter(int chunkX, int chunkZ, int height, int grid) {
        int jitter = grid / 16;
        int regionX = region(chunkX, grid);
        int regionZ = region(chunkZ, grid);
        long seed = (long) regionX * 3129871L ^ (long) regionZ * 116129781L;
        seed = seed * seed * 42317861L + seed * 7L;
        int num0 = (int) (seed >> 12 & 3L);
        int num1 = (int) (seed >> 15 & 3L);
        int num2 = (int) (seed >> 18 & 3L);
        int num3 = (int) (seed >> 21 & 3L);
        int centerX = 8 + num0 - num1;
        int centerZ = 8 + num2 - num3;
        int ccz = regionZ >= 0 ? (regionZ * grid + (centerZ - 8) * jitter) * 16 + 8 : (regionZ * grid + (16 - centerZ - 8) * jitter) * 16 + 9;
        int ccx = regionX >= 0 ? (regionX * grid + (centerX - 8) * jitter) * 16 + 8 : (regionX * grid + (16 - centerX - 8) * jitter) * 16 + 9;
        return new BlockPos(ccx, height, ccz);
    }

    /**
     * 终焉城堡主楼该放的位置：起点区块正好是 64 区块网格的地标中心区块时，返回地标中心（y 不用）；否则返回 null，照原版放。
     * 原版 `FinalCastleMainComponent` 把主楼吸到 256 格的网格点上（x = x + 127 >> 8 << 8）。64 区块网格下起点区块离网格点最远 12 个区块，
     * 吸附后主楼偏移最大 +121 格，南缘超出 `ChunkGenerator.createReferences` 的 8 区块引用半径，城堡被切掉一截，位置也和 /tf center、选种图对不上。
     * 所以主楼直接放在地标中心（就在起点区块里），主楼和迷宫塔（限定在城堡中心 128 格以内，见 `FinalCastleMazeTower13ComponentMixin`）基本都落在起点区块 ±8 个区块里；
     * 落不进去的个别迷宫塔和不限远近的残塔、废塔，见 `castleTowerFits`。
     * 不是地标中心区块的起点（别的维度里 /place 的）和网格无关，不动。
     */
    public static BlockPos castleCenter(int chunkX, int chunkZ) {
        BlockPos center = nearestCenter(chunkX, chunkZ, 0, GRID);
        return center.getX() >> 4 == chunkX && center.getZ() >> 4 == chunkZ ? center : null;
    }

    /** 结构起点的引用半径（区块）：ChunkGenerator.createReferences 只看周围这么远的起点，再远的区块里不放这个结构的方块 */
    public static final int REFERENCE_RADIUS = 8;

    /**
     * 终焉城堡外围的塔（迷宫塔、残塔、废塔）放不放得下：主楼在地标中心 (mainX, mainZ) 时，塔连同外扩的一圈（minX～maxX、minZ～maxZ）
     * 要整个落在起点区块（主楼中心所在区块）±8 个区块里；主楼不在地标中心（照原版放的城堡）一律放得下。
     * 迷宫塔随机外接残塔（`FinalCastleDamagedTowerComponent`），残塔再接废塔（`FinalCastleWreckedTowerComponent`），各隔 14～37 格，
     * 原版只查撞不撞、不限离城堡多远，外圈的会伸出引用半径，伸出去的部分不生成（残塔墙被切、荆棘和桥断开）。用户要城堡完整，
     * 所以超出的塔当作撞上了，暮色照「这个方向放不下」处理：换个方向试，或者这座就不接。迷宫塔也查一遍（离中心正好 127 格的屋顶会伸出 1 格），
     * 那里不放时暮色让迷宫改道，接不到出口就整段重来，和原版超出 128 格时一样。
     */
    public static boolean castleTowerFits(int mainX, int mainZ, int minX, int minZ, int maxX, int maxZ) {
        int sx = mainX >> 4, sz = mainZ >> 4;
        BlockPos center = castleCenter(sx, sz);
        if (center == null || center.getX() != mainX || center.getZ() != mainZ) return true;
        return minX >> 4 >= sx - REFERENCE_RADIUS && maxX >> 4 <= sx + REFERENCE_RADIUS
                && minZ >> 4 >= sz - REFERENCE_RADIUS && maxZ >> 4 <= sz + REFERENCE_RADIUS;
    }

    /** 照 FinalCastleMazeTower13Component.isWithinRange：两点在 x、z 上都相距不到 range 格 */
    public static boolean withinRange(int centerX, int centerZ, int posX, int posZ, int range) {
        return Math.abs(centerX - posX) < range && Math.abs(centerZ - posZ) < range;
    }

    /** 照 LegacyLandmarkPlacements.pickVarietyLandmark：普通森林里的地标。每 8×8 个网格强制一组娜迦庭院、巫妖塔，其余抽签 */
    public static TFLandmark varietyLandmark(int chunkX, int chunkZ, long seed, int grid) {
        chunkX = round(chunkX, grid);
        chunkZ = round(chunkZ, grid);
        int shift = Integer.numberOfTrailingZeros(grid);
        int regionOffsetX = Math.abs((chunkX + grid * 4 >> shift) % 8);
        int regionOffsetZ = Math.abs((chunkZ + grid * 4 >> shift) % 8);
        if (regionOffsetX == 4 && regionOffsetZ == 5 || regionOffsetX == 4 && regionOffsetZ == 3) {
            return TFLandmark.LICH_TOWER;
        }
        if (regionOffsetX == 5 && regionOffsetZ == 4 || regionOffsetX == 3 && regionOffsetZ == 4) {
            return TFLandmark.NAGA_COURTYARD;
        }
        return switch (new Random(seed + (long) chunkX * 25117L + (long) chunkZ * 151121L).nextInt(16)) {
            case 6, 7, 8 -> TFLandmark.MEDIUM_HILL;
            case 9 -> TFLandmark.LARGE_HILL;
            case 10, 11 -> TFLandmark.HEDGE_MAZE;
            case 12, 13 -> TFLandmark.NAGA_COURTYARD;
            case 14, 15 -> TFLandmark.LICH_TOWER;
            default -> TFLandmark.SMALL_HILL;
        };
    }
}
