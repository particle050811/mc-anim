package mcai.mixin;

import mcai.Freeze;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 冻结时跳过服务端世界一个 tick 里“会让世界变化”的各段，区块加载和玩家不在其中。 */
@Mixin(ServerLevel.class)
public class ServerLevelMixin {
    /** 时间、天气、方块事件（活塞、音符盒）、随机刻（庄稼、结冰、打雷）、幻翼/商人等特殊刷怪 */
    @Inject(method = {"tickTime", "advanceWeatherCycle", "runBlockEvents", "tickChunk", "tickCustomSpawners"}, at = @At("HEAD"), cancellable = true)
    private void mcai$freeze(CallbackInfo ci) {
        if (Freeze.frozen) ci.cancel();
    }

    /** 实体：玩家照常 tick（要能移动机位），其余全部停住 */
    @Inject(method = "tickNonPassenger", at = @At("HEAD"), cancellable = true)
    private void mcai$freezeEntity(Entity entity, CallbackInfo ci) {
        if (Freeze.frozen && !(entity instanceof Player)) ci.cancel();
    }
}
