package mcai.mixin;

import mcai.BigJigsaw;
import net.minecraft.core.SectionPos;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkStatus;
import net.minecraft.world.level.chunk.StructureAccess;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/**
 * 大拼图结构按引用取起点（见 BigJigsaw 第 3 条）：fillStartsForStructure 用 level.getChunk 回起点区块拿结构，
 * 噪声、放方块这几步的 level 是只含周围 8 个区块的 WorldGenRegion，起点更远时原版直接崩。
 * 这时 getChunk 返回 null，接着取起点那一下换成 BigJigsaw.farStart（缓存里取，没有就现算）。区块在范围里的照原版。
 */
@Mixin(StructureManager.class)
public abstract class StructureManagerMixin {
    @Shadow
    @Final
    private LevelAccessor level;

    @Redirect(method = "fillStartsForStructure", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/LevelAccessor;getChunk(IILnet/minecraft/world/level/chunk/ChunkStatus;)Lnet/minecraft/world/level/chunk/ChunkAccess;"))
    private ChunkAccess mcai$chunkOrNull(LevelAccessor level, int x, int z, ChunkStatus status) {
        if (level instanceof WorldGenRegion region && !region.hasChunk(x, z)) return null;
        return level.getChunk(x, z, status);
    }

    @Redirect(method = "fillStartsForStructure", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/StructureManager;getStartForStructure(Lnet/minecraft/core/SectionPos;Lnet/minecraft/world/level/levelgen/structure/Structure;Lnet/minecraft/world/level/chunk/StructureAccess;)Lnet/minecraft/world/level/levelgen/structure/StructureStart;"))
    private StructureStart mcai$startOrFar(StructureManager self, SectionPos pos, Structure s, StructureAccess access) {
        if (access == null) return BigJigsaw.farStart((WorldGenRegion) this.level, s, pos.chunk());
        return self.getStartForStructure(pos, s, access);
    }
}
