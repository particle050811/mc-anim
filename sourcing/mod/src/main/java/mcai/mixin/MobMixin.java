package mcai.mixin;

import mcai.Freeze;
import net.minecraft.world.entity.Mob;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mob.class)
public class MobMixin {
    /** 距离消失判定不走实体 tick，要单独拦：否则机位一拉远（>128 格），冻结中的生物照样被清掉 */
    @Inject(method = "checkDespawn", at = @At("HEAD"), cancellable = true)
    private void mcai$freeze(CallbackInfo ci) {
        if (Freeze.frozen) ci.cancel();
    }
}
