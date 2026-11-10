package mcai.mixin;

import net.minecraft.client.particle.SingleQuadParticle;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** 录制读方片粒子的 quadSize（构造完成时的半边长；每刻画的大小另取 getQuadSize）。 */
@Mixin(SingleQuadParticle.class)
public interface SingleQuadParticleAccessor {
    @Accessor("quadSize")
    float mcai$getQuadSize();
}
