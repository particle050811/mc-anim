package mcai;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraftforge.event.RegisterCommandsEvent;

import java.nio.file.Path;

/**
 * 服务端控制台命令（`anim world server <世界> -- "mcai far <任务.json>" "wait:mcai 远景：完成"`）：
 * `mcai far` 远景取样（FarTerrain，后台线程跑，日志报进度）；`mcai landmarks` 列地标（FarLandmarks，当场跑完）。权限 4，只给控制台和管理员。
 */
public final class ServerCommands {
    private ServerCommands() {
    }

    public static void onRegister(RegisterCommandsEvent event) {
        register(event.getDispatcher());
    }

    private static void register(CommandDispatcher<CommandSourceStack> d) {
        d.register(Commands.literal("mcai").requires(s -> s.hasPermission(4))
                .then(Commands.literal("far").then(Commands.argument("任务", StringArgumentType.greedyString()).executes(c -> {
                    String job = StringArgumentType.getString(c, "任务");
                    try {
                        FarTerrain.start(c.getSource().getServer(), Path.of(job));
                    } catch (Exception e) {
                        c.getSource().sendFailure(Component.literal("mcai 远景：失败 " + e));
                        return 0;
                    }
                    c.getSource().sendSuccess(() -> Component.literal("mcai 远景：已开始 " + job), false);
                    return 1;
                })))
                .then(Commands.literal("landmarks").then(Commands.argument("任务", StringArgumentType.greedyString()).executes(c -> {
                    try {
                        FarLandmarks.run(c.getSource().getServer(), Path.of(StringArgumentType.getString(c, "任务")));
                    } catch (Exception e) {
                        c.getSource().sendFailure(Component.literal("mcai 地标：失败 " + e));
                        return 0;
                    }
                    return 1;
                }))));
    }
}
