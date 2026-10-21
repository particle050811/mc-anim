package mcai.mixin;

import mcai.Freeze;
import net.minecraft.client.multiplayer.ClientLevel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientLevel.class)
public class ClientLevelMixin {
    /** 客户端自己每 tick 也会把时间往前推一格（服务端每秒再校准），冻结时一并停掉，太阳才完全不动 */
    @Inject(method = "tickTime", at = @At("HEAD"), cancellable = true)
    private void mcai$freeze(CallbackInfo ci) {
        if (Freeze.frozen) ci.cancel();
    }
}
