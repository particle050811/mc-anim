package mcai.mixin;

import mcai.FillBiome;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.biome.BiomeResolver;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.blending.Blender;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * 大结构铺满群系（见 FillBiome）：doCreateBiomes 把群系写进区块那一下（ChunkAccess.fillBiomesFromNoise）换上 FillBiome.resolver。
 * 只换写进区块的群系；同一个类里的雕刻洞穴、结构起点都直接问 biomeSource，不受影响。
 * ModifyArg 拿不到目标方法的参数，开头把 StructureManager 和区块记在本线程上（doCreateBiomes 在一个线程里从头跑到尾）。
 */
@Mixin(NoiseBasedChunkGenerator.class)
public abstract class NoiseBasedChunkGeneratorMixin {
    private static final ThreadLocal<Object[]> mcai$args = new ThreadLocal<>();

    @Inject(method = "doCreateBiomes", at = @At("HEAD"))
    private void mcai$rememberArgs(Blender blender, RandomState rs, StructureManager sm, ChunkAccess chunk, CallbackInfo ci) {
        mcai$args.set(new Object[]{sm, chunk});
    }

    @ModifyArg(method = "doCreateBiomes", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/chunk/ChunkAccess;fillBiomesFromNoise(Lnet/minecraft/world/level/biome/BiomeResolver;Lnet/minecraft/world/level/biome/Climate$Sampler;)V"), index = 0)
    private BiomeResolver mcai$fillBiome(BiomeResolver orig) {
        Object[] a = mcai$args.get();
        mcai$args.remove();
        if (a == null) return orig;
        return FillBiome.resolver(orig, (StructureManager) a[0], (ChunkAccess) a[1]);
    }
}
