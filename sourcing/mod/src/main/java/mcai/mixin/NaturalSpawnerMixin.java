package mcai.mixin;

import mcai.Freeze;
import net.minecraft.world.level.NaturalSpawner;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(NaturalSpawner.class)
public class NaturalSpawnerMixin {
    /** 自然刷怪：冻结期间不让画面里多出新生物 */
    @Inject(method = "spawnForChunk", at = @At("HEAD"), cancellable = true)
    private static void mcai$freeze(CallbackInfo ci) {
        if (Freeze.frozen) ci.cancel();
    }
}
