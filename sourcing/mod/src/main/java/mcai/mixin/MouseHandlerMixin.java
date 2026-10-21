package mcai.mixin;

import mcai.Input;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
    /** 输入锁定时：点击、滚轮、移动都不处理，也不让游戏抓鼠标（抓住之后鼠标一动视角就转） */
    @Inject(method = {"onPress", "onScroll", "onMove", "grabMouse"}, at = @At("HEAD"), cancellable = true)
    private void mcai$lock(CallbackInfo ci) {
        if (!Input.enabled) ci.cancel();
    }
}
