package mcai.mixin;

import mcai.Throttle;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Minecraft.class)
public class MinecraftMixin {
    /** 空闲限帧：runTick 末尾按这个数 limitDisplayFPS（小于 260 才限），所以改返回值就够，不碰设置 */
    @Inject(method = "getFramerateLimit", at = @At("RETURN"), cancellable = true)
    private void mcai$idleFps(CallbackInfoReturnable<Integer> cir) {
        cir.setReturnValue(Throttle.limit(cir.getReturnValueI()));
    }
}
