package mcai.mixin;

import mcai.record.Recorder;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleEngine;
import net.minecraft.core.particles.ParticleOptions;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * 录制（record 动作）挂在粒子引擎的两个入口：createParticle 是「按类型 + 参数造一颗」（服务端 sendParticles、客户端 addParticle 都走它），
 * add 是「把造好的粒子放进引擎」（createParticle 里面也调它；模组自己 new 出粒子再 add 的只走这一个）。
 * createParticle 开头记下类型和参数，add 时拿到构造完成的实例一起记；没在录就什么都不做。
 */
@Mixin(ParticleEngine.class)
public class ParticleEngineMixin {
    @Inject(method = "createParticle", at = @At("HEAD"))
    private void mcai$beforeCreate(ParticleOptions options, double x, double y, double z, double xd, double yd, double zd, CallbackInfoReturnable<Particle> cir) {
        Recorder.beforeCreate(options, x, y, z, xd, yd, zd);
    }

    @Inject(method = "createParticle", at = @At("RETURN"))
    private void mcai$afterCreate(ParticleOptions options, double x, double y, double z, double xd, double yd, double zd, CallbackInfoReturnable<Particle> cir) {
        Recorder.afterCreate();
    }

    @Inject(method = "add", at = @At("HEAD"))
    private void mcai$add(Particle particle, CallbackInfo ci) {
        Recorder.onAdd(particle);
    }
}
