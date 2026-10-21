package mcai.mixin;

import mcai.TwilightGrid;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import twilightforest.world.components.structures.type.FinalCastleStructure;

/**
 * 终焉城堡主楼：暮色在 FinalCastleMainComponent 的构造函数里把主楼吸到写死的 256 格网格点上，
 * 64 区块网格下会偏出去，为什么、放到哪见 TwilightGrid.castleCenter。
 *
 * 主楼刚造好、还没往下长出地基、角塔和迷宫（那些都按主楼的包围盒摆）时，把它平移到地标中心。
 * 包围盒是 49×49，原版放在吸附点 ±24 格，平移后中心就是地标中心。
 * 暮色的方法名不混淆，所以 remap = false。
 */
@Mixin(value = FinalCastleStructure.class, remap = false)
public class FinalCastleStructureMixin {
    @Inject(method = "getFirstPiece", at = @At("RETURN"))
    private void mcai$centerOnLandmark(Structure.GenerationContext context, RandomSource random, ChunkPos chunkPos, int x, int y, int z,
                                       CallbackInfoReturnable<StructurePiece> cir) {
        if (!TwilightGrid.enabled) return;
        BlockPos center = TwilightGrid.castleCenter(chunkPos.x, chunkPos.z);
        if (center == null) return;
        StructurePiece main = cir.getReturnValue();
        BlockPos now = main.getBoundingBox().getCenter();
        main.move(center.getX() - now.getX(), 0, center.getZ() - now.getZ());
    }
}
