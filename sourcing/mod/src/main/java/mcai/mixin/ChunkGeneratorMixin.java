package mcai.mixin;

import mcai.BigJigsaw;
import net.minecraft.core.Holder;
import net.minecraft.core.RegistryAccess;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.function.Predicate;

/**
 * 大拼图结构的引用（见 BigJigsaw 第 2 条）：
 * - createReferences 原版只看周围 8 个区块里的起点，后面接上 BigJigsaw.addFarReferences 看到大结构的 reach；
 * - tryGenerateStructure（起点区块算起点）里大结构从 BigJigsaw 的缓存取，和别的区块记引用时算的是同一个对象，一座城只拼一次。
 */
@Mixin(ChunkGenerator.class)
public abstract class ChunkGeneratorMixin {
    @Inject(method = "createReferences", at = @At("TAIL"))
    private void mcai$farReferences(WorldGenLevel level, StructureManager sm, ChunkAccess chunk, CallbackInfo ci) {
        BigJigsaw.addFarReferences(level, sm, chunk);
    }

    @Redirect(method = "tryGenerateStructure", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/levelgen/structure/Structure;generate(Lnet/minecraft/core/RegistryAccess;Lnet/minecraft/world/level/chunk/ChunkGenerator;Lnet/minecraft/world/level/biome/BiomeSource;Lnet/minecraft/world/level/levelgen/RandomState;Lnet/minecraft/world/level/levelgen/structure/templatesystem/StructureTemplateManager;JLnet/minecraft/world/level/ChunkPos;ILnet/minecraft/world/level/LevelHeightAccessor;Ljava/util/function/Predicate;)Lnet/minecraft/world/level/levelgen/structure/StructureStart;"))
    private StructureStart mcai$cachedStart(Structure s, RegistryAccess ra, ChunkGenerator gen, BiomeSource bs, RandomState rs, StructureTemplateManager stm,
                                            long seed, ChunkPos pos, int refs, LevelHeightAccessor height, Predicate<Holder<Biome>> biomes) {
        if (BigJigsaw.reach(s) <= BigJigsaw.VANILLA_REACH) return s.generate(ra, gen, bs, rs, stm, seed, pos, refs, height, biomes);
        return BigJigsaw.generate(s, ra, gen, rs, stm, seed, pos, height);
    }
}
