package mcai.gamedata;

import java.util.List;
import java.util.Map;

/**
 * 从游戏里取数据（群系色、方块模型）的窄接口。动作（BiomesAction、BlocksAction）和出表（BiomeTable、BlockTable）只认这一组接口，
 * 本包里的类不 import Minecraft 和加载器的类；和游戏版本、加载器耦合的只有实现 forge1201/。
 * 移植到别的版本（如 NeoForge 1.21.1）：照 forge1201/ 另写一个实现，两个动作里换一行构造。耦合点清单见 docs/游戏导表.md。
 */
public interface GameData {
    /** 游戏和加载器版本，如「1.20.1 forge-47.4.10」，写进表的「取材」 */
    String gameVersion();

    /** 装了的模组：id → 版本，按 id 排 */
    Map<String, String> mods();

    /** 启用的资源包 id，按游戏里的叠放顺序（后面的盖前面的） */
    List<String> resourcePacks();

    BiomeSource biomes();

    BlockSource blocks();
}
