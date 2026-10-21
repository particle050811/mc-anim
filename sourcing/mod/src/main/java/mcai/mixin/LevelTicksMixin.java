package mcai.mixin;

import mcai.Freeze;
import net.minecraft.world.ticks.LevelTicks;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LevelTicks.class)
public class LevelTicksMixin {
    /**
     * 计划刻（水流、红石中继器、沙子下落）。在入口整个跳过，队列原样留着，解冻后接着跑；
     * 如果改成拦 ServerLevel.tickBlock，到点的计划刻会被取出队列然后丢掉。
     */
    @Inject(method = "tick(JILjava/util/function/BiConsumer;)V", at = @At("HEAD"), cancellable = true)
    private void mcai$freeze(CallbackInfo ci) {
        if (Freeze.frozen) ci.cancel();
    }
}
