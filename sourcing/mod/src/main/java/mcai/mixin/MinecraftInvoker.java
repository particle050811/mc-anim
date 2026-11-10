package mcai.mixin;

import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

/** 录制里「按一下右键」：走游戏自己的 startUseItem（准星对着谁就先跟谁交互，否则用手里的物品），和真人点右键同一条路。 */
@Mixin(Minecraft.class)
public interface MinecraftInvoker {
    @Invoker("startUseItem")
    void mcai$startUseItem();
}
