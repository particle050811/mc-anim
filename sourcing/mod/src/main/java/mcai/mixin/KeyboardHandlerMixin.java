package mcai.mixin;

import mcai.Input;
import net.minecraft.client.KeyboardHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KeyboardHandler.class)
public class KeyboardHandlerMixin {
    /** 输入锁定时：按键和打字都不处理（ESC 弹不出暂停菜单，WASD 不会移动机位） */
    @Inject(method = {"keyPress", "charTyped"}, at = @At("HEAD"), cancellable = true)
    private void mcai$lock(CallbackInfo ci) {
        if (!Input.enabled) ci.cancel();
    }
}
