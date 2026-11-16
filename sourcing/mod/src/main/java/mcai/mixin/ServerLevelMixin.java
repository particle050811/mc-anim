package mcai.mixin;

import mcai.Freeze;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.GameRules;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 冻结时跳过服务端世界一个 tick 里“会让世界变化”的各段，区块加载和玩家不在其中。 */
@Mixin(ServerLevel.class)
public class ServerLevelMixin {
    /** 时间、方块事件（活塞、音符盒）、随机刻（庄稼、结冰、打雷）、幻翼/商人等特殊刷怪 */
    @Inject(method = {"tickTime", "runBlockEvents", "tickChunk", "tickCustomSpawners"}, at = @At("HEAD"), cancellable = true)
    private void mcai$freeze(CallbackInfo ci) {
        if (Freeze.frozen) ci.cancel();
    }

    /**
     * 天气：天气循环开着才停。循环关着时（mcai game start 进存档就关）这一段只把雨量渐变到命令设的天气、通知客户端，
     * 停了它，冻结中的 weather rain / clear 就不生效。进存档默认冻结以后，这是必须先解冻的最常见一处，所以放开。
     */
    @Inject(method = "advanceWeatherCycle", at = @At("HEAD"), cancellable = true)
    private void mcai$freezeWeather(CallbackInfo ci) {
        if (Freeze.frozen && ((ServerLevel) (Object) this).getGameRules().getBoolean(GameRules.RULE_WEATHER_CYCLE)) ci.cancel();
    }

    /** 实体：玩家照常 tick（要能移动机位），其余全部停住 */
    @Inject(method = "tickNonPassenger", at = @At("HEAD"), cancellable = true)
    private void mcai$freezeEntity(Entity entity, CallbackInfo ci) {
        if (Freeze.frozen && !(entity instanceof Player)) ci.cancel();
    }
}
