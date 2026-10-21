package mcai.mixin;

import mcai.TwilightGrid;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.StructurePieceAccessor;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;
import twilightforest.world.components.structures.finalcastle.FinalCastleMazeTower13Component;

/**
 * 终焉城堡的迷宫塔：暮色要求每座外接塔离城堡中心不到 128 格，城堡中心原本写死成主楼旁的 256 格网格点（`buildContinueTowerTowards` 里
 * start.minX + 128 >> 8 << 8）。64 区块网格下主楼放在地标中心（见 `FinalCastleStructureMixin`），不在网格点上，
 * 原式算出的中心最多差 137 格，迷宫塔接不到出口时整段迷宫被拆掉重来，15 次不成就没了。
 * 所以开关打开时城堡中心取主楼包围盒的中心（主楼不在地标中心的城堡，结果和原式一样）。
 * `isWithinRange` 在这个方法里调了两次，第 2 次（ordinal = 1）是城堡范围那次，第 1 次是看离迷宫出口近不近，不动。
 * 另外，迷宫塔外接的残塔、废塔不许伸出起点区块的引用半径（`mcai$collideOrOutOfReach`）。
 * 暮色的方法名不混淆，所以 remap = false；注入点是 Minecraft 方法的那处单独 remap = true。
 */
@Mixin(value = FinalCastleMazeTower13Component.class, remap = false)
public class FinalCastleMazeTower13ComponentMixin {
    @Redirect(method = "buildContinueTowerTowards", at = @At(value = "INVOKE",
            target = "Ltwilightforest/world/components/structures/finalcastle/FinalCastleMazeTower13Component;isWithinRange(IIIII)Z", ordinal = 1))
    private boolean mcai$nearCastleCenter(FinalCastleMazeTower13Component self, int centerX, int centerZ, int posX, int posZ, int range,
                                          StructurePieceAccessor list) {
        if (TwilightGrid.enabled) {
            // 走到这一步时 list 一定是 StructurePiecesBuilder（原方法先判断过），第 0 件是主楼
            BlockPos main = ((StructurePiecesBuilderAccessor) list).mcai$pieces().get(0).getBoundingBox().getCenter();
            centerX = main.getX();
            centerZ = main.getZ();
            // 塔身 13×13（中心 ±6），屋顶、地基再往外 2 格；负半轴的网格中心在第 9 格，离中心 127 格的塔屋顶会被切掉一条，这种也不放
            // （见 `TwilightGrid.castleTowerFits`）
            if (!TwilightGrid.castleTowerFits(centerX, centerZ, posX - 8, posZ - 8, posX + 8, posZ + 8)) return false;
        }
        return TwilightGrid.withinRange(centerX, centerZ, posX, posZ, range);
    }

    /**
     * 残塔、废塔（`buildDamagedTower` 外接的装饰塔）伸出起点区块 ±8 个区块的引用半径时，当作撞上了别的结构件，暮色就不放这座
     * （见 `TwilightGrid.castleTowerFits`）。查的是暮色自己做碰撞检查的框：塔外扩 6 格（含 5 格的荆棘、2 格的地基）；
     * 返回主楼只是给一个非 null 的「撞上了」，暮色不用它。
     */
    @Redirect(method = "buildDamagedTower", at = @At(value = "INVOKE", remap = true,
            target = "Lnet/minecraft/world/level/levelgen/structure/StructurePieceAccessor;findCollisionPiece(Lnet/minecraft/world/level/levelgen/structure/BoundingBox;)Lnet/minecraft/world/level/levelgen/structure/StructurePiece;"))
    private StructurePiece mcai$collideOrOutOfReach(StructurePieceAccessor list, BoundingBox box) {
        StructurePiece hit = list.findCollisionPiece(box);
        if (hit != null || !TwilightGrid.enabled || !(list instanceof StructurePiecesBuilderAccessor builder)) return hit;
        StructurePiece main = builder.mcai$pieces().get(0);
        BlockPos c = main.getBoundingBox().getCenter();
        return TwilightGrid.castleTowerFits(c.getX(), c.getZ(), box.minX(), box.minZ(), box.maxX(), box.maxZ()) ? null : main;
    }
}
