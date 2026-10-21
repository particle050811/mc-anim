package mcai.mixin;

import mcai.Freeze;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Level.class)
public class LevelMixin {
    /** 方块实体（熔炉、漏斗、刷怪笼、机械动力的机器）。只停服务端的，客户端的动画照常。 */
    @Inject(method = "tickBlockEntities", at = @At("HEAD"), cancellable = true)
    private void mcai$freeze(CallbackInfo ci) {
        if (Freeze.frozen && !((Level) (Object) this).isClientSide) ci.cancel();
    }
}
