package mcai.mixin;

import mcai.TwilightGrid;
import net.minecraft.core.BlockPos;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import twilightforest.init.TFLandmark;
import twilightforest.util.LegacyLandmarkPlacements;
import twilightforest.util.XZQuadrantIterator;

/**
 * 暮色森林放大 4 倍的世界里，把地标网格从 16 区块放大到 64 区块（为什么见 `TwilightGrid`）。
 *
 * 暮色 4.3.2508 里凡是按网格找地标的地方都走这个类：结构起点、地标附近起丘和压平、暮色树冠让位、/locate、/tf center、装饰避让、魔法地图、进度限制、传送门落点。
 * 网格大小写死在下面五个方法里。字节码里查过，别处另写死了网格的有两样：云中小屋的云层另算了一遍网格编号（见 `ChunkGeneratorTwilightMixin`），
 * 终焉城堡按 256 格网格摆主楼和迷宫（见 `FinalCastleStructureMixin`、`FinalCastleMazeTower13ComponentMixin`）。
 * 暮色的方法名不混淆，所以 remap = false。
 */
@Mixin(value = LegacyLandmarkPlacements.class, remap = false)
public class LegacyLandmarkPlacementsMixin {
    /** 网格中心：别的方法（chunkHasLandmarkCenter、distanceFromCenter、两参数的重载）都从这里取 */
    @Inject(method = "getNearestCenterXZ(III)Lnet/minecraft/core/BlockPos;", at = @At("HEAD"), cancellable = true)
    private static void mcai$nearestCenter(int chunkX, int chunkZ, int height, CallbackInfoReturnable<BlockPos> cir) {
        if (TwilightGrid.enabled) cir.setReturnValue(TwilightGrid.nearestCenter(chunkX, chunkZ, height, TwilightGrid.GRID));
    }

    /**
     * 地形改造用的地标种类：原方法先把区块取整到 16 的倍数，再取那一点的群系。
     * 这里先取整到 64 的倍数，原方法再取整到 16 就不变了，后面的取群系、按群系选地标照原样走。
     */
    @ModifyVariable(method = {"pickLandmarkForChunk", "getFeatureForRegion"}, at = @At("HEAD"), argsOnly = true, ordinal = 0)
    private static int mcai$roundX(int chunkX) {
        return TwilightGrid.enabled ? TwilightGrid.round(chunkX, TwilightGrid.GRID) : chunkX;
    }

    @ModifyVariable(method = {"pickLandmarkForChunk", "getFeatureForRegion"}, at = @At("HEAD"), argsOnly = true, ordinal = 1)
    private static int mcai$roundZ(int chunkZ) {
        return TwilightGrid.enabled ? TwilightGrid.round(chunkZ, TwilightGrid.GRID) : chunkZ;
    }

    /** 普通森林里的地标（结构起点和地形改造都用）。除了取整，强制娜迦/巫妖的 8×8 网格编号也按 64 区块算，只能整个换掉 */
    @Inject(method = "pickVarietyLandmark", at = @At("HEAD"), cancellable = true)
    private static void mcai$variety(int chunkX, int chunkZ, long seed, CallbackInfoReturnable<TFLandmark> cir) {
        if (TwilightGrid.enabled) cir.setReturnValue(TwilightGrid.varietyLandmark(chunkX, chunkZ, seed, TwilightGrid.GRID));
    }

    /** /locate 逐个网格点扫：起点对齐到 64 区块，步长 64。扫的圈数（ChunkGeneratorTwilight 传进来的 radius）不变，覆盖距离跟着放大 4 倍 */
    @Inject(method = "landmarkCenterScanner", at = @At("HEAD"), cancellable = true)
    private static void mcai$scanner(BlockPos searchFocus, int gridSearchRadius, CallbackInfoReturnable<XZQuadrantIterator<BlockPos>> cir) {
        if (!TwilightGrid.enabled) return;
        int grid = TwilightGrid.GRID;
        cir.setReturnValue(new XZQuadrantIterator<>(searchFocus.getX() >> 4 & -grid, searchFocus.getZ() >> 4 & -grid, false, gridSearchRadius, grid, LegacyLandmarkPlacements::getNearestCenterXZ));
    }
}
