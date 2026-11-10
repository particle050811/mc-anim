package mcai.mixin;

import net.minecraft.client.particle.Particle;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** 录制读粒子实例的受保护字段（Particle 1.20.1）。 */
@Mixin(Particle.class)
public interface ParticleAccessor {
    @Accessor("x")
    double mcai$getX();

    @Accessor("y")
    double mcai$getY();

    @Accessor("z")
    double mcai$getZ();

    @Accessor("xd")
    double mcai$getXd();

    @Accessor("yd")
    double mcai$getYd();

    @Accessor("zd")
    double mcai$getZd();

    @Accessor("age")
    int mcai$getAge();

    @Accessor("gravity")
    float mcai$getGravity();

    @Accessor("friction")
    float mcai$getFriction();

    @Accessor("hasPhysics")
    boolean mcai$getHasPhysics();

    @Accessor("rCol")
    float mcai$getR();

    @Accessor("gCol")
    float mcai$getG();

    @Accessor("bCol")
    float mcai$getB();

    @Accessor("alpha")
    float mcai$getAlpha();

    @Accessor("roll")
    float mcai$getRoll();

    @Accessor("bbWidth")
    float mcai$getBbWidth();

    @Accessor("bbHeight")
    float mcai$getBbHeight();

    @Accessor("speedUpWhenYMotionIsBlocked")
    boolean mcai$getSpeedUp();
}
