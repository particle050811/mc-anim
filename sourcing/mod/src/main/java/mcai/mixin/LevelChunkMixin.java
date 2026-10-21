package mcai.mixin;

import mcai.Undo;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(LevelChunk.class)
public class LevelChunkMixin {
    /** 所有方块写入（命令、结构放置、方块自己的逻辑）最后都走这里，是给撤销记“改之前”的唯一入口 */
    @Inject(method = "setBlockState", at = @At("HEAD"))
    private void mcai$record(BlockPos pos, BlockState state, boolean isMoving, CallbackInfoReturnable<BlockState> cir) {
        Undo.beforeBlockChange((LevelChunk) (Object) this, pos);
    }
}
