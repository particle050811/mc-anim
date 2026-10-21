package mcai.mixin;

import mcai.TwilightGrid;
import net.minecraft.world.level.ChunkPos;
import org.objectweb.asm.Opcodes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;
import twilightforest.world.components.chunkgenerators.ChunkGeneratorTwilight;

/**
 * 云中小屋（高地的巨魔洞上空）的云层形状：暮色在 deformTerrainForTrollCloud2 里照抄了一遍网格编号 (区块 + 8) >> 4，
 * 拿它当云团偏移的随机种子。网格放大到 64 区块后（见 TwilightGrid），一片云会跨过 16 区块的编号边界，
 * 两边用不同的种子，云在区块边上断开。所以把这里的编号也换成 64 区块的。
 * 这个方法里 ChunkPos 的 x、z 各只读一次，就是算编号那两次；返回一个让 (值 + 8) >> 4 恰好等于 64 区块编号的假坐标。
 */
@Mixin(value = ChunkGeneratorTwilight.class, remap = false)
public class ChunkGeneratorTwilightMixin {
    @Redirect(method = "deformTerrainForTrollCloud2", at = @At(value = "FIELD", target = "Lnet/minecraft/world/level/ChunkPos;x:I", opcode = Opcodes.GETFIELD, remap = true))
    private static int mcai$cloudRegionX(ChunkPos pos) {
        return TwilightGrid.enabled ? (TwilightGrid.region(pos.x, TwilightGrid.GRID) << 4) - 8 : pos.x;
    }

    @Redirect(method = "deformTerrainForTrollCloud2", at = @At(value = "FIELD", target = "Lnet/minecraft/world/level/ChunkPos;z:I", opcode = Opcodes.GETFIELD, remap = true))
    private static int mcai$cloudRegionZ(ChunkPos pos) {
        return TwilightGrid.enabled ? (TwilightGrid.region(pos.z, TwilightGrid.GRID) << 4) - 8 : pos.z;
    }
}
