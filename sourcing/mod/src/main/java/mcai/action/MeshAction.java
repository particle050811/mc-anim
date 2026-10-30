package mcai.action;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.blaze3d.vertex.VertexFormat;
import mcai.Action;
import mcai.ActionException;
import mcai.Actions;
import mcai.Args;
import mcai.Game;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.ItemBlockRenderTypes;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.Sheets;
import net.minecraft.client.renderer.block.BlockRenderDispatcher;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.ColorResolver;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.lighting.LevelLightEngine;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.client.ForgeHooksClient;
import net.minecraftforge.client.model.data.ModelData;
import net.minecraftforge.fml.ModList;
import net.minecraftforge.forgespi.language.IModInfo;
import org.lwjgl.opengl.GL11;

import java.io.BufferedOutputStream;
import java.util.zip.Deflater;
import java.util.zip.GZIPOutputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;

import java.util.ArrayList;
import java.util.BitSet;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 把一块区域导出成网格：不自己解析方块模型，而是让游戏的方块渲染器把每个方块画一遍，把它吐出来的面原样接住。
 * 实体（画、物品展示框、盔甲架……）和方块实体（箱子、告示牌、战利品……）也一样：调它们自己的渲染器，接住吐出来的面。
 * 这样拿到的就是游戏实际会画的面：被不透明方块挡住的面渲染器自己不出（地下实心的部分一个面都没有），
 * 楼梯、栅栏、模组的异形方块、群系染色、环境光遮蔽都是渲染器算好的，不用另外处理。
 *
 * 输出三个文件（out 不带扩展名）：
 * - out.json：说明（范围、原点、各层的面数、图集尺寸、标记点）。层：solid 实心、cutout 镂空、translucent 半透明、plants 没有碰撞体积的方块（花草为主，按镂空画）。
 *   sprites：图集里每张贴图的名字和位置 rect [u0, v0, 宽, 高]（0~1，和 rects 同一算法，可按值对上）；取材：从哪个存档、什么参数、哪些模组版本导出来的
 * - out.bin ：顶点（gzip 压缩），解压后每个 28 字节小端：x y z（float，游戏坐标减去 origin）、u v（float）、r g b a（字节）、贴图号（int）；每 4 个顶点一个面。
 *   贴图号 0 = 普通面，u v 是图集里的 0~1（v 朝下）；贴图号 n>0 = 合并出来的大面，u v 是平铺的格数，贴图是 json 里 rects 的第 n-1 张
 * - out.png ：只含用到的贴图的小图集（方块贴图按张放；实体贴图只抠用到的那一块）
 * 同一片区域、同一世界状态重导，图集排布和面的顺序不随游戏会话变：图集按（高度、贴图名）排，实体、方块实体按位置排，遍历都用有序结构。
 * 手写的贴图坐标和按像素反推方块名的派生数据都靠这一条（架构评估第 12 条，用户 10-21 定）
 */
public class MeshAction implements Action {
    private static final VertexConsumer SINK = new Sink();

    public String name() {
        return "mesh";
    }

    public String doc() {
        return "把一块区域按游戏渲染器实际画出来的面导出成网格（json + bin + png），给参考模型库当场景模型。区域要在镜头的渲染距离内";
    }

    public List<Param> params() {
        return List.of(
                Param.opt("from", "x,y,z", "一个角（和 to 一起写；不写就要写 structure）"),
                Param.opt("to", "x,y,z", "对角（含）"),
                Param.opt("structure", "结构id", "范围取这个结构的包围盒（含结构为贴合地形外扩的部分），代替 from/to；如 twilightforest:lich_tower"),
                Param.opt("at", "x,y,z", "structure 取哪一处：水平方向包含这一点的那个结构；默认玩家（镜头）所在位置"),
                Param.must("out", "路径", "不带扩展名，会写出 .json、.bin、.png 三个文件"),
                Param.opt("origin", "x,y,z", "导出坐标的原点（游戏坐标）。不写就是区域底面的中心"),
                Param.opt("outside", "0|1", "1 = 只要从外面看得到的：从区域顶上往里灌，灌不到的封闭洞穴和房间不导出（大范围地形用）。默认 0"),
                Param.opt("entities", "0|1|all", "1（默认）= 导出画、展示框、盔甲架这类不会动的实体和方块实体；all = 连生物一起（按当前姿势定格）；0 = 只要方块"),
                Param.opt("merge", "0|1", "1（默认）= 同一平面上挨着的、贴图和颜色都一样的整格面拼成大面，面数少很多；0 = 一格一个面"),
                Param.opt("skip", "方块名,方块名", "不导出的方块，写 id 里冒号后面的部分，可用 * 通配，如 firefly,*vine*"),
                Param.opt("mark", "方块id,方块id", "这些方块的位置记进 json 的 markers（方块本身照常导出，除非也在 skip 里）"));
    }

    public Where where() {
        // 范围超出渲染距离时要一块一块挪镜头、等区块，跨很多帧；留在 HTTP 线程上调度，每一块的活投到渲染线程做
        return Where.HTTP;
    }

    /** 一块的边长（格）：不超过镜头渲染距离能覆盖的范围。 */
    private static final int TILE = 128;

    public JsonElement run(Args args) throws Exception {
        long t0 = System.nanoTime();
        BlockPos[] box = range(args);
        Job job = Game.onClient(() -> new Job(args, box[0], box[1]));
        boolean loaded = Game.onClient(() -> job.missing(job.rx0, job.rz0, job.rx1, job.rz1) == 0);
        if (loaded) {
            long c0 = System.nanoTime();
            Game.onClient(() -> job.tile(job.rx0, job.rz0, job.rx1, job.rz1));
            job.captureNs += System.nanoTime() - c0;
        } else {
            // 客户端只有镜头周围的区块：按区块对齐切成块，镜头挪到每一块正上方，等这一块的区块到齐再导，面都攒进同一份输出
            Vec3 eye = Game.onClient(() -> job.mc.player.getEyePosition());
            float yaw = Game.onClient(() -> job.mc.player.getYRot()), pitch = Game.onClient(() -> job.mc.player.getXRot());
            try {
                for (int tz = job.rz0 >> 7 << 7; tz <= job.rz1; tz += TILE) {
                    for (int tx = job.rx0 >> 7 << 7; tx <= job.rx1; tx += TILE) {
                        int ax = Math.max(tx, job.rx0), az = Math.max(tz, job.rz0), bx = Math.min(tx + TILE - 1, job.rx1), bz = Math.min(tz + TILE - 1, job.rz1);
                        JsonObject cam = new JsonObject();
                        cam.addProperty("pos", (ax + bx + 1) / 2.0 + "," + Math.min(job.y1 + 30, 300) + "," + (az + bz + 1) / 2.0);
                        cam.addProperty("pitch", "90");
                        long w0 = System.nanoTime();
                        Actions.call("cam", new Args(cam, args.cwd()));
                        long deadline = System.currentTimeMillis() + 180_000;
                        while (Game.onClient(() -> job.missing(ax, az, bx, bz)) > 0) {
                            if (System.currentTimeMillis() > deadline) throw new ActionException("分块导出：等了 180 秒，(" + ax + "," + az + ")～(" + bx + "," + bz + ") 这一块的区块还没到齐");
                            Thread.sleep(100);
                        }
                        long c0 = System.nanoTime();
                        job.waitNs += c0 - w0;
                        Game.onClient(() -> job.tile(ax, az, bx, bz));
                        job.captureNs += System.nanoTime() - c0;
                        job.tiles++;
                    }
                }
            } finally {
                // 镜头还回原处
                JsonObject back = new JsonObject();
                back.addProperty("pos", eye.x + "," + eye.y + "," + eye.z);
                back.addProperty("yaw", String.valueOf(yaw));
                back.addProperty("pitch", String.valueOf(pitch));
                Actions.call("cam", new Args(back, args.cwd()));
            }
        }
        long f0 = System.nanoTime();
        JsonObject r = (JsonObject) Game.onClient(job::finish);
        JsonObject timing = new JsonObject();
        timing.addProperty("total", Math.round((System.nanoTime() - t0) / 1e8) / 10.0);
        if (job.tiles > 0) timing.addProperty("moveAndWait", Math.round(job.waitNs / 1e8) / 10.0);
        timing.addProperty("capture", Math.round(job.captureNs / 1e8) / 10.0);
        timing.addProperty("write", Math.round((System.nanoTime() - f0) / 1e8) / 10.0);
        r.add("seconds", timing);
        return r;
    }

    /** 导出范围的两个角：from/to 直接给，或 structure 按结构包围盒算。结构起点只在服务端有，到集成服务端线程上查 */
    private static BlockPos[] range(Args args) throws Exception {
        boolean corners = args.has("from") || args.has("to");
        if (args.has("structure") == corners) throw new ActionException("范围要么写 from 和 to，要么写 structure（二选一）");
        if (corners) {
            if (!args.has("from") || !args.has("to")) throw new ActionException("from 和 to 要一起写");
            return new BlockPos[]{BlockPos.containing(args.vec("from")), BlockPos.containing(args.vec("to"))};
        }
        return Game.onServer(() -> {
            ServerLevel sl = Game.player().serverLevel();
            ResourceLocation id = ResourceLocation.tryParse(args.str("structure"));
            Structure s = id == null ? null : sl.registryAccess().registryOrThrow(Registries.STRUCTURE).get(id);
            if (s == null) throw new ActionException("没有这个结构：" + args.str("structure"));
            BlockPos at = args.has("at") ? BlockPos.containing(args.vec("at")) : Game.player().blockPosition();
            // 结构起点挂在起点区块上，别的区块只记引用；按 at 所在区块的引用找，水平方向含 at 的才算（at 常在结构上空的镜头位置，不比 y）
            for (StructureStart st : sl.structureManager().startsForStructure(new ChunkPos(at), x -> x == s)) {
                BoundingBox bb = st.getBoundingBox();
                if (st.isValid() && bb.minX() <= at.getX() && at.getX() <= bb.maxX() && bb.minZ() <= at.getZ() && at.getZ() <= bb.maxZ()) {
                    return new BlockPos[]{new BlockPos(bb.minX(), bb.minY(), bb.minZ()), new BlockPos(bb.maxX(), bb.maxY(), bb.maxZ())};
                }
            }
            throw new ActionException("(" + at.getX() + "," + at.getZ() + ") 不在 " + id + " 里（这一区块没有它的引用；用 at= 指到结构里，或先 /locate structure " + id + "）");
        });
    }

    /** 一次导出的全部状态。范围大时分多块导，每一块的面都攒在这里，最后一起写文件。 */
    private static final class Job {
        final Minecraft mc = Minecraft.getInstance();
        final ClientLevel level;
        final Args args;
        /** 整个导出范围 */
        final int rx0, rz0, rx1, rz1, y0, y1, sy;
        final Vec3 origin;
        final String[] skip;
        final Set<String> mark;
        final boolean outside;
        final String entityMode;
        // 朝向明暗交给参考模型库的灯光：这里让渲染器算出来的顶点色只含染色和环境光遮蔽
        final BlockAndTintGetter view;
        final BlockRenderDispatcher renderer;
        final RandomSource random = RandomSource.create();
        final PoseStack pose = new PoseStack();
        final Map<Integer, TextureAtlasSprite[]> atlases = new HashMap<>();
        final Map<String, Capture> captures = new LinkedHashMap<>();
        final Map<Integer, float[]> glBox = new HashMap<>();
        final Map<RenderType, Capture> layers = new HashMap<>();
        final Map<BlockState, TextureAtlasSprite[]> spriteCache = new HashMap<>();
        final Set<TextureAtlasSprite> used = new LinkedHashSet<>();
        final Map<String, Integer> notExported = new TreeMap<>();
        final Map<String, JsonArray> markers = new TreeMap<>();
        final Map<String, Integer> entitiesDone = new TreeMap<>(), entitiesSkipped = new TreeMap<>();
        /** 各种方块出了多少个面（合并前），用来看哪种方块最占面数 */
        final Map<String, Integer> quadsByBlock = new TreeMap<>();
        /** 独立贴图的显卡编号 → 贴图名（排图集、写 sprites 用；显卡编号每次开游戏都不一样） */
        final Map<Integer, String> glNames = new HashMap<>();
        Capture plants;
        /** 分块导时，跨块的实体（位置在块边上）只导一次 */
        final Set<Integer> entitySeen = new HashSet<>();
        int blocks, tiles;
        long waitNs, captureNs;

        Job(Args args, BlockPos a, BlockPos b) {
            this.args = args;
            level = mc.level;
            if (level == null) throw new ActionException("还没进入世界");
            rx0 = Math.min(a.getX(), b.getX());
            rz0 = Math.min(a.getZ(), b.getZ());
            rx1 = Math.max(a.getX(), b.getX());
            rz1 = Math.max(a.getZ(), b.getZ());
            y0 = Math.max(Math.min(a.getY(), b.getY()), level.getMinBuildHeight());
            y1 = Math.min(Math.max(a.getY(), b.getY()), level.getMaxBuildHeight() - 1);
            sy = y1 - y0 + 1;
            origin = args.has("origin") ? args.vec("origin") : new Vec3((rx0 + rx1 + 1) / 2.0, y0, (rz0 + rz1 + 1) / 2.0);
            skip = args.has("skip") ? args.str("skip").split(",") : new String[0];
            mark = args.has("mark") ? Set.of(args.str("mark").split(",")) : Set.of();
            outside = "1".equals(args.str("outside", "0"));
            entityMode = args.str("entities", "1");
            view = new NoShade(level);
            renderer = mc.getBlockRenderer();
            // 游戏的几张图集（方块、箱子、告示牌、画……）：显卡编号 → 里面的全部小贴图。
            // 用图集的面按小贴图导出；不这样的话，实体渲染器画出来的物品、箱子会把整张几千像素的图集抠进来
            for (ResourceLocation loc : List.of(TextureAtlas.LOCATION_BLOCKS, TextureAtlas.LOCATION_PARTICLES, Sheets.SHULKER_SHEET, Sheets.BED_SHEET,
                    Sheets.BANNER_SHEET, Sheets.SHIELD_SHEET, Sheets.SIGN_SHEET, Sheets.CHEST_SHEET, Sheets.ARMOR_TRIMS_SHEET, Sheets.DECORATED_POT_SHEET,
                    new ResourceLocation("textures/atlas/paintings.png"))) {
                if (mc.getTextureManager().getTexture(loc, null) instanceof TextureAtlas atlas) {
                    atlases.put(atlas.getId(), atlas.getTextureLocations().stream().map(atlas::getSprite).toArray(TextureAtlasSprite[]::new));
                }
            }
            TextureAtlasSprite[] blockSprites = atlases.get(mc.getTextureManager().getTexture(TextureAtlas.LOCATION_BLOCKS).getId());
            plants = captures.computeIfAbsent("plants|false|blocks", k -> new Capture("plants", false, -1, glBox, blockSprites));
            for (RenderType rt : RenderType.chunkBufferLayers()) {
                Capture cap = captures.computeIfAbsent(layerName(rt) + "|false|blocks", k -> new Capture(layerName(rt), false, -1, glBox, blockSprites));
                cap.merge = !"0".equals(args.str("merge", "1"));
                cap.baseX = origin.x;
                cap.baseY = origin.y;
                cap.baseZ = origin.z;
                layers.put(rt, cap);
            }
        }

        /** 这个范围里客户端还没有的区块数。没到的区块读出来全是空气，导出会悄悄缺一块，所以导之前要查。 */
        int missing(int x0, int z0, int x1, int z1) {
            int n = 0;
            for (int cx = x0 >> 4; cx <= x1 >> 4; cx++) {
                for (int cz = z0 >> 4; cz <= z1 >> 4; cz++) {
                    if (!level.getChunkSource().hasChunk(cx, cz)) n++;
                }
            }
            return n;
        }

        private boolean buried(BlockPos pos) {
            BlockPos.MutableBlockPos n = new BlockPos.MutableBlockPos();
            for (Direction d : Direction.values()) {
                n.setWithOffset(pos, d);
                BlockState s = level.getBlockState(n);
                if (!(s.getBlock() instanceof LeavesBlock) && !s.isSolidRender(level, n)) return false;
            }
            return true;
        }

        /** 导出一块（水平范围 x0,z0～x1,z1，高度用整个导出范围的）。在渲染线程上跑。 */
        Void tile(int x0, int z0, int x1, int z1) {
        int sx = x1 - x0 + 1, sz = z1 - z0 + 1;
        if (missing(x0, z0, x1, z1) > 0) throw new ActionException("区域里有区块客户端还没加载");
        // 只要外面看得到的：从这一块最上面一层的非实心格往里灌
        BitSet open = outside ? flood(level, x0, y0, z0, sx, sy, sz) : null;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int y = y0; y <= y1; y++) {
            for (int z = z0; z <= z1; z++) {
                for (int x = x0; x <= x1; x++) {
                    pos.set(x, y, z);
                    BlockState state = level.getBlockState(pos);
                    if (state.isAir()) continue;
                    String id = BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
                    if (mark.contains(id)) {
                        JsonArray p = new JsonArray();
                        p.add(x + 0.5 - origin.x);
                        p.add(y - origin.y);
                        p.add(z + 0.5 - origin.z);
                        markers.computeIfAbsent(id, k -> new JsonArray()).add(p);
                    }
                    if (matches(id.substring(id.indexOf(':') + 1), skip)) continue;
                    if (open != null && !visible(open, x - x0, y - y0, z - z0, sx, sy, sz)) continue;
                    // 树叶不挡面，每块六面都画；被树叶或实心方块六面包住的（`buried`）从外面看不到，不导。最外一层照常导
                    if (state.getBlock() instanceof LeavesBlock && buried(pos)) continue;
                    boolean drew = false;
                    int before = 0;
                    for (Capture c : captures.values()) before += c.count + c.pending();
                    FluidState fluid = state.getFluidState();
                    if (!fluid.isEmpty()) {
                        Capture cap = layers.get(ItemBlockRenderTypes.getRenderLayer(fluid));
                        // 液体渲染器写的是区块内坐标（0~15），没有变换矩阵，这里把区块原点补回去
                        cap.offset((x & ~15) - origin.x, (y & ~15) - origin.y, (z & ~15) - origin.z);
                        cap.sprites = ForgeHooksClient.getFluidSprites(view, pos, fluid);
                        renderer.renderLiquid(pos, view, cap, state, fluid);
                        drew = true;
                    }
                    if (state.getRenderShape() == RenderShape.MODEL) {
                        BakedModel model = renderer.getBlockModel(state);
                        ModelData at = level.getModelDataManager().getAt(pos);
                        ModelData data = model.getModelData(view, pos, state, at == null ? ModelData.EMPTY : at);
                        random.setSeed(state.getSeed(pos));
                        TextureAtlasSprite[] sprites = spriteCache.get(state);
                        if (sprites == null) {
                            sprites = sprites(model, state, random, data);
                            spriteCache.put(state, sprites);
                        }
                        // 没有碰撞体积的方块（花草、蘑菇、火把、藤蔓）单独一层：镜头里角色要跑过的地方，可以按范围把它们去掉（一格高的草会挡住腿）
                        boolean loose = fluid.isEmpty() && state.getCollisionShape(level, pos).isEmpty();
                        for (RenderType rt : model.getRenderTypes(state, random, data)) {
                            Capture cap = loose ? plants : layers.get(rt);
                            if (cap == null) continue;
                            cap.offset(0, 0, 0);
                            cap.sprites = sprites;
                            pose.pushPose();
                            pose.translate(x - origin.x, y - origin.y, z - origin.z);
                            random.setSeed(state.getSeed(pos));
                            try {
                                renderer.renderBatched(state, pos, view, pose, cap, true, random, data, rt);
                            } catch (RuntimeException ex) {
                                // 个别模组方块画不出来（抛 Tesselating block model），跳过，别让整个导出失败
                                cap.abortQuad();
                                entitiesSkipped.merge(id + "（方块渲染出错）", 1, Integer::sum);
                            }
                            pose.popPose();
                        }
                        drew = true;
                    }
                    if (drew) {
                        blocks++;
                        int after = 0;
                        for (Capture c : captures.values()) after += c.count + c.pending();
                        quadsByBlock.merge(id, after - before, Integer::sum);
                    }
                    // 箱子、告示牌这类靠方块实体渲染器画的，方块渲染器不出面
                    else notExported.merge(id, 1, Integer::sum);
                }
            }
        }
        // 实体和方块实体：方块渲染器不出它们的面，调它们各自的渲染器。它们的贴图不在方块图集里，一种渲染类型一张贴图
        if (!"0".equals(entityMode)) {
            MultiBufferSource source = rt -> {
                String n = rt.toString();
                n = n.substring(n.indexOf('[') + 1, Math.max(n.indexOf(':'), n.indexOf('[') + 1)).toLowerCase();
                // 只接四边形；影子、附魔光效、名牌文字、描边不是模型本身
                if (rt.mode() != VertexFormat.Mode.QUADS || n.contains("shadow") || n.contains("glint") || n.contains("text") || n.contains("outline")) return SINK;
                String kind = n.contains("translucent") ? "translucent" : n.contains("solid") ? "solid" : "cutout";
                boolean both = n.contains("no_cull") || n.contains("translucent");
                // 渲染类型用哪张贴图没有公开的取法：让它把自己的状态设上，再看 0 号贴图绑的是谁
                rt.setupRenderState();
                int tex = RenderSystem.getShaderTexture(0);
                rt.clearRenderState();
                TextureAtlasSprite[] inAtlas = atlases.get(tex);
                if (inAtlas == null) glNames.computeIfAbsent(tex, k -> textureName(rt, k));
                Capture cap = captures.computeIfAbsent(kind + "|" + both + "|" + tex, k -> new Capture(kind, both, inAtlas == null ? tex : -1, glBox, inAtlas));
                cap.offset(0, 0, 0);
                cap.sprites = null;
                return cap;
            };
            AABB box = new AABB(x0, y0, z0, x1 + 1, y1 + 1, z1 + 1);
            EntityRenderDispatcher erd = mc.getEntityRenderDispatcher();
            erd.setRenderShadow(false);
            try {
                // 按种类、位置排：渲染顺序决定面的顺序和独立贴图进图集的先后，游戏给的顺序跟实体编号走，每次进世界都不一样
                List<Entity> inBox = new ArrayList<>();
                for (Entity e : level.entitiesForRendering()) {
                    if (box.contains(e.position()) && !(e instanceof Player)) inBox.add(e);
                }
                inBox.sort(Comparator.comparing((Entity e) -> BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString())
                        .thenComparingDouble(Entity::getX).thenComparingDouble(Entity::getY).thenComparingDouble(Entity::getZ)
                        .thenComparing(Entity::getStringUUID));
                for (Entity e : inBox) {
                    if (!entitySeen.add(e.getId())) continue;
                    String id = BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString();
                    // 会走动的生物默认不要（场景是静止的，定格一只走到一半的鹿没有意义）；掉落物、经验球也不要
                    boolean moving = e instanceof Mob || e instanceof ItemEntity || e instanceof ExperienceOrb;
                    if (moving && !"all".equals(entityMode)) {
                        entitiesSkipped.merge(id, 1, Integer::sum);
                        continue;
                    }
                    PoseStack ep = new PoseStack();
                    try {
                        erd.render(e, e.getX() - origin.x, e.getY() - origin.y, e.getZ() - origin.z, e.getYRot(), 1.0F, ep, source, LightTexture.FULL_BRIGHT);
                        entitiesDone.merge(id, 1, Integer::sum);
                    } catch (RuntimeException ex) {
                        entitiesSkipped.merge(id + "（渲染出错）", 1, Integer::sum);
                    }
                }
            } finally {
                erd.setRenderShadow(true);
            }
            for (int ccx = x0 >> 4; ccx <= x1 >> 4; ccx++) {
                for (int ccz = z0 >> 4; ccz <= z1 >> 4; ccz++) {
                    List<BlockEntity> bes = new ArrayList<>(level.getChunk(ccx, ccz).getBlockEntities().values());
                    bes.sort(Comparator.comparing(BlockEntity::getBlockPos));
                    for (BlockEntity be : bes) {
                        BlockPos bp = be.getBlockPos();
                        if (bp.getX() < x0 || bp.getX() > x1 || bp.getY() < y0 || bp.getY() > y1 || bp.getZ() < z0 || bp.getZ() > z1) continue;
                        // 直接拿渲染器：走分发器的话离镜头 64 格以外的会被它自己跳过
                        BlockEntityRenderer<BlockEntity> ber = mc.getBlockEntityRenderDispatcher().getRenderer(be);
                        if (ber == null) continue;
                        String id = BuiltInRegistries.BLOCK.getKey(be.getBlockState().getBlock()).toString();
                        if (matches(id.substring(id.indexOf(':') + 1), skip)) continue;
                        PoseStack bpose = new PoseStack();
                        bpose.translate(bp.getX() - origin.x, bp.getY() - origin.y, bp.getZ() - origin.z);
                        try {
                            ber.render(be, 1.0F, bpose, source, LightTexture.FULL_BRIGHT, OverlayTexture.NO_OVERLAY);
                            entitiesDone.merge(id, 1, Integer::sum);
                            notExported.remove(id);
                        } catch (RuntimeException ex) {
                            entitiesSkipped.merge(id + "（渲染出错）", 1, Integer::sum);
                        }
                    }
                }
            }
        }
        for (Capture cap : captures.values()) cap.flush();
        return null;
        }

        /** 全部块导完：拼图集、写三个文件。在渲染线程上跑（要从显卡读贴图）。 */
        JsonElement finish() throws IOException {
        int x0 = rx0, z0 = rz0, x1 = rx1, z1 = rz1;
        int sx = x1 - x0 + 1, sz = z1 - z0 + 1;
        Set<Integer> glUsed = new LinkedHashSet<>();
        for (Capture cap : captures.values()) {
            used.addAll(cap.used);
            if (cap.glTex >= 0 && cap.count > 0) glUsed.add(cap.glTex);
        }
        if (used.isEmpty() && glUsed.isEmpty()) throw new ActionException("这个区域里没有可导出的面");

        // 小图集：把用到的贴图抠出来重新排。实体贴图整张从显卡读回来，只抠面上用到的那一块
        Map<Integer, NativeImage> glImages = new HashMap<>();
        Map<Object, int[]> src = new LinkedHashMap<>();   // 贴图 → 在来源图里的 [x, y, 宽, 高]
        Map<ResourceLocation, NativeImage> fulls = new HashMap<>();
        Path out = args.path("out");
        Files.createDirectories(out.getParent());
        int w = 64, h = 64;
        Map<Object, int[]> place = new HashMap<>();
        List<Object> order;
        try {
            for (TextureAtlasSprite s : used) src.put(s, new int[]{s.getX(), s.getY(), s.contents().width(), s.contents().height()});
            for (int id : glUsed) {
                RenderSystem.bindTexture(id);
                NativeImage img = new NativeImage(GlStateManager._getTexLevelParameter(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH),
                        GlStateManager._getTexLevelParameter(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT), false);
                img.downloadTexture(0, false);
                glImages.put(id, img);
                float[] bx = glBox.get(id);
                int ax = Mth.clamp(Mth.floor(bx[0] * img.getWidth()), 0, img.getWidth() - 1), ay = Mth.clamp(Mth.floor(bx[1] * img.getHeight()), 0, img.getHeight() - 1);
                int bx1 = Mth.clamp(Mth.ceil(bx[2] * img.getWidth()), ax + 1, img.getWidth()), by1 = Mth.clamp(Mth.ceil(bx[3] * img.getHeight()), ay + 1, img.getHeight());
                src.put(id, new int[]{ax, ay, bx1 - ax, by1 - ay, img.getWidth(), img.getHeight()});
            }
            // 按高度从大到小一行行放，一样高的按贴图名
            order = new ArrayList<>(src.keySet());
            order.sort(Comparator.comparingInt((Object k) -> -src.get(k)[3]).thenComparing(this::spriteName));
            long area = 0;
            int widest = 0;
            for (Object k : order) {
                area += (long) src.get(k)[2] * src.get(k)[3];
                widest = Math.max(widest, src.get(k)[2]);
            }
            while (w < widest || (long) w * w < area * 5 / 4) w *= 2;
            int cx = 0, cy = 0, rowH = 0;
            for (Object k : order) {
                int sw = src.get(k)[2], sh = src.get(k)[3];
                if (cx + sw > w) {
                    cx = 0;
                    cy += rowH;
                    rowH = 0;
                }
                place.put(k, new int[]{cx, cy});
                cx += sw;
                rowH = Math.max(rowH, sh);
            }
            while (h < cy + rowH) h *= 2;
            try (NativeImage atlas = new NativeImage(w, h, true)) {
                for (Object k : order) {
                    NativeImage from;
                    if (k instanceof TextureAtlasSprite s) {
                        from = fulls.get(s.atlasLocation());
                        if (from == null) {
                            RenderSystem.bindTexture(mc.getTextureManager().getTexture(s.atlasLocation()).getId());
                            from = new NativeImage(GlStateManager._getTexLevelParameter(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH),
                                    GlStateManager._getTexLevelParameter(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT), false);
                            from.downloadTexture(0, false);
                            fulls.put(s.atlasLocation(), from);
                        }
                    } else {
                        from = glImages.get(k);
                    }
                    int[] r = src.get(k), p = place.get(k);
                    for (int yy = 0; yy < r[3]; yy++) {
                        for (int xx = 0; xx < r[2]; xx++) atlas.setPixelRGBA(p[0] + xx, p[1] + yy, from.getPixelRGBA(r[0] + xx, r[1] + yy));
                    }
                }
                atlas.writeToFile(sibling(out, ".png"));
            }
        } finally {
            fulls.values().forEach(NativeImage::close);
            glImages.values().forEach(NativeImage::close);
        }

        JsonArray layerInfo = new JsonArray();
        int quads = 0;
        long binBytes = 0;
        // 合并出来的面用到的贴图：在图集里的位置，写进 json 的 rects，面上只存是第几张
        Map<TextureAtlasSprite, Integer> rectIndex = new LinkedHashMap<>();
        Map<String, List<Capture>> groups = new LinkedHashMap<>();
        for (Capture cap : captures.values()) {
            if (cap.count > 0) groups.computeIfAbsent(cap.kind + "|" + cap.both, k -> new ArrayList<>()).add(cap);
        }
        // 大范围导出很大：一层层直接写进文件，不在内存里再拼一份。gzip 用最快档（更高档省不了多少、慢很多）
        try (OutputStream bin = new GZIPOutputStream(new BufferedOutputStream(Files.newOutputStream(sibling(out, ".bin")), 1 << 20), 1 << 16) {
            {
                def.setLevel(Deflater.BEST_SPEED);
            }
        }) {
            for (List<Capture> group : groups.values()) {
                JsonObject li = new JsonObject();
                li.addProperty("name", group.get(0).kind);
                li.addProperty("doubleSide", group.get(0).both);
                li.addProperty("byteOffset", binBytes);
                int n = 0;
                for (Capture cap : group) {
                    binBytes += cap.write(bin, place, src, w, h, rectIndex);
                    n += cap.count;
                }
                li.addProperty("quads", n);
                layerInfo.add(li);
                quads += n;
            }
        }

        JsonObject o = new JsonObject();
        o.addProperty("dim", level.dimension().location().toString());
        o.add("from", ints(x0, y0, z0));
        o.add("to", ints(x1, y1, z1));
        JsonArray og = new JsonArray();
        og.add(origin.x);
        og.add(origin.y);
        og.add(origin.z);
        o.add("origin", og);
        o.addProperty("vertexBytes", Capture.STRIDE);
        o.add("atlas", ints(w, h));
        o.add("layers", layerInfo);
        JsonArray rects = new JsonArray();
        for (TextureAtlasSprite sp : rectIndex.keySet()) {
            int[] pp = place.get(sp), rr = src.get(sp);
            JsonArray one = new JsonArray();
            one.add((double) pp[0] / w);
            one.add((double) pp[1] / h);
            one.add((double) rr[2] / w);
            one.add((double) rr[3] / h);
            rects.add(one);
        }
        o.add("rects", rects);
        // 图集里每张贴图是谁：方块贴图写贴图名和所在的游戏图集；独立贴图（实体）写贴图文件，crop 是从它上面抠下来的像素范围 [x, y, 宽, 高]
        JsonArray sprites = new JsonArray();
        for (Object k : order) {
            int[] pp = place.get(k), rr = src.get(k);
            JsonObject one = new JsonObject();
            JsonArray rect = new JsonArray();
            rect.add((double) pp[0] / w);
            rect.add((double) pp[1] / h);
            rect.add((double) rr[2] / w);
            rect.add((double) rr[3] / h);
            if (k instanceof TextureAtlasSprite s) {
                one.addProperty("name", s.contents().name().toString());
                one.addProperty("atlas", s.atlasLocation().toString());
            } else {
                one.addProperty("name", spriteName(k));
                one.add("crop", ints(rr[0], rr[1], rr[2], rr[3]));
            }
            one.add("rect", rect);
            sprites.add(one);
        }
        o.add("sprites", sprites);
        JsonObject mk = new JsonObject();
        markers.forEach(mk::add);
        o.add("markers", mk);
        o.add("取材", provenance());
        Files.writeString(sibling(out, ".json"), o.toString(), StandardCharsets.UTF_8);

        JsonObject r = new JsonObject();
        r.addProperty("out", out.toString());
        r.addProperty("size", sx + "x" + sy + "x" + sz);
        r.addProperty("blocks", blocks);
        r.addProperty("quads", quads);
        int merged = 0;
        for (Capture cap : captures.values()) merged += cap.merged;
        r.addProperty("quadsSavedByMerging", merged);
        JsonObject top = new JsonObject();
        quadsByBlock.entrySet().stream().sorted((x, y) -> y.getValue() - x.getValue()).limit(8).forEach(e -> top.addProperty(e.getKey(), e.getValue()));
        r.add("quadsByBlockBeforeMerging", top);
        r.addProperty("textures", src.size());
        r.addProperty("atlas", w + "x" + h);
        r.addProperty("binBytes", binBytes);
        r.addProperty("binFileBytes", Files.size(sibling(out, ".bin")));
        if (tiles > 0) r.addProperty("tiles", tiles);
        int lost = 0;
        for (Capture cap : captures.values()) lost += cap.lost;
        if (lost > 0) r.addProperty("quadsWithoutTexture", lost);
        if (!entitiesDone.isEmpty()) {
            JsonObject ed = new JsonObject();
            entitiesDone.forEach(ed::addProperty);
            r.add("entities", ed);
        }
        if (!entitiesSkipped.isEmpty()) {
            JsonObject es = new JsonObject();
            entitiesSkipped.forEach(es::addProperty);
            r.add("entitiesSkipped", es);
        }
        if (!notExported.isEmpty()) {
            JsonObject ne = new JsonObject();
            notExported.forEach(ne::addProperty);
            r.add("notExported", ne);
        }
        return r;
        }

        /** 排图集用的名字：图集里的贴图是「贴图名@图集」，独立贴图是贴图文件名 */
        String spriteName(Object k) {
            if (k instanceof TextureAtlasSprite s) return s.contents().name() + "@" + s.atlasLocation();
            return glNames.getOrDefault((Integer) k, "gl#" + k);
        }

        /** json 的「取材」：从哪个实例、存档（或服务器）、什么参数导的，当时装的模组和资源包。不写时间，同一状态重导 json 不变 */
        JsonObject provenance() {
            JsonObject p = new JsonObject();
            Path game = mc.gameDirectory.toPath().toAbsolutePath().normalize();
            if (game.getParent() != null) p.addProperty("实例", game.getParent().getFileName().toString());
            if (mc.getSingleplayerServer() != null) {
                p.addProperty("存档", mc.getSingleplayerServer().getWorldData().getLevelName());
                Path world = mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
                p.addProperty("世界目录", world.startsWith(game) ? game.relativize(world).toString() : world.getFileName().toString());
            } else if (mc.getCurrentServer() != null) {
                p.addProperty("服务器", mc.getCurrentServer().ip);
            }
            p.addProperty("维度", level.dimension().location().toString());
            JsonObject given = new JsonObject();
            for (Param prm : new MeshAction().params()) {
                if (!"out".equals(prm.name()) && args.has(prm.name())) given.add(prm.name(), args.raw(prm.name()));
            }
            p.add("参数", given);
            JsonObject mods = new JsonObject();
            ModList.get().getMods().stream().sorted(Comparator.comparing(IModInfo::getModId))
                    .forEach(m -> mods.addProperty(m.getModId(), m.getVersion().toString()));
            p.add("模组", mods);
            // mods.toml 里的版本号不跟着改代码变，再记源码版本（build.gradle 写进 jar 的 mcai-source.txt：sourcing/mod 最后一次提交，
            // 有没提交的改动带 -dirty）。不记 jar 的 sha：同一份源码换台机器构建，jar 的 sha 也该一样，记提交才对得上、能重导
            p.addProperty("mcai 源码", mcaiSource());
            JsonArray packs = new JsonArray();
            mc.getResourcePackRepository().getSelectedIds().forEach(packs::add);
            p.add("资源包", packs);
            return p;
        }
    }

    /** jar 里 mcai-source.txt 的一行；读不到（开发环境直接跑、老 jar）写 unknown */
    private static String mcaiSource() {
        var self = ModList.get().getModFileById("mcai");
        if (self == null) return "unknown";
        try {
            Path f = self.getFile().findResource("mcai-source.txt");
            return Files.isRegularFile(f) ? Files.readString(f).trim() : "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }

    private static final Pattern TEXTURE_IN_RENDER_TYPE = Pattern.compile("Optional\\[([^\\]\\s]+)\\]\\(blur=");

    /** 渲染类型绑的贴图文件名。没有公开的取法，从 toString 里读（RenderStateShard.TextureStateShard 写成 texture[Optional[名字](blur=..)]）；读不到退回显卡编号 */
    private static String textureName(RenderType rt, int glId) {
        Matcher m = TEXTURE_IN_RENDER_TYPE.matcher(rt.toString());
        return m.find() ? m.group(1) : "gl#" + glId;
    }

    private static Path sibling(Path out, String ext) {
        return out.resolveSibling(out.getFileName() + ext);
    }

    private static JsonArray ints(int... v) {
        JsonArray a = new JsonArray();
        for (int i : v) a.add(i);
        return a;
    }

    private static String layerName(RenderType rt) {
        if (rt == RenderType.solid()) return "solid";
        if (rt == RenderType.cutoutMipped() || rt == RenderType.cutout()) return "cutout";
        return "translucent";
    }

    private static boolean matches(String name, String[] patterns) {
        for (String p : patterns) {
            if (name.matches(p.trim().replace("*", ".*"))) return true;
        }
        return false;
    }

    /** 一个方块状态的模型会用到哪些贴图：用来把渲染器吐出来的面对回贴图（面上只有图集坐标）。 */
    private static TextureAtlasSprite[] sprites(BakedModel model, BlockState state, RandomSource random, ModelData data) {
        Set<TextureAtlasSprite> set = new LinkedHashSet<>();
        for (RenderType rt : model.getRenderTypes(state, random, data)) {
            for (Direction d : Direction.values()) {
                for (BakedQuad q : model.getQuads(state, d, random, data, rt)) set.add(q.getSprite());
            }
            for (BakedQuad q : model.getQuads(state, null, random, data, rt)) set.add(q.getSprite());
        }
        set.add(model.getParticleIcon(data));
        return set.toArray(new TextureAtlasSprite[0]);
    }

    /** 从区域最上面一层出发，穿过所有不是整格实心的格子，返回灌得到的格子。 */
    private static BitSet flood(ClientLevel level, int x0, int y0, int z0, int sx, int sy, int sz) {
        BitSet solid = new BitSet(sx * sy * sz);
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int y = 0; y < sy; y++) {
            for (int z = 0; z < sz; z++) {
                for (int x = 0; x < sx; x++) {
                    pos.set(x0 + x, y0 + y, z0 + z);
                    if (level.getBlockState(pos).isSolidRender(level, pos)) solid.set((y * sz + z) * sx + x);
                }
            }
        }
        BitSet open = new BitSet(sx * sy * sz);
        int[] queue = new int[sx * sy * sz];
        int head = 0, tail = 0;
        for (int z = 0; z < sz; z++) {
            for (int x = 0; x < sx; x++) {
                int i = ((sy - 1) * sz + z) * sx + x;
                if (!solid.get(i)) {
                    open.set(i);
                    queue[tail++] = i;
                }
            }
        }
        int layer = sx * sz;
        while (head < tail) {
            int i = queue[head++];
            int x = i % sx, z = (i / sx) % sz, y = i / layer;
            if (x > 0) tail = visit(i - 1, solid, open, queue, tail);
            if (x < sx - 1) tail = visit(i + 1, solid, open, queue, tail);
            if (z > 0) tail = visit(i - sx, solid, open, queue, tail);
            if (z < sz - 1) tail = visit(i + sx, solid, open, queue, tail);
            if (y > 0) tail = visit(i - layer, solid, open, queue, tail);
            if (y < sy - 1) tail = visit(i + layer, solid, open, queue, tail);
        }
        return open;
    }

    private static int visit(int i, BitSet solid, BitSet open, int[] queue, int tail) {
        if (solid.get(i) || open.get(i)) return tail;
        open.set(i);
        queue[tail] = i;
        return tail + 1;
    }

    /** 这一格自己灌得到（花草、树叶、水），或者挨着一个灌得到的格子（实心方块露在外面的那一层）。 */
    private static boolean visible(BitSet open, int x, int y, int z, int sx, int sy, int sz) {
        int i = (y * sz + z) * sx + x;
        if (open.get(i)) return true;
        return (x > 0 && open.get(i - 1)) || (x < sx - 1 && open.get(i + 1))
                || (z > 0 && open.get(i - sx)) || (z < sz - 1 && open.get(i + sx))
                || (y > 0 && open.get(i - sx * sz)) || (y < sy - 1 && open.get(i + sx * sz))
                // 区域边上的方块朝外的那一面没有邻居可查，一律算看得到（最上面一层除外，它已经是起点）
                || x == 0 || x == sx - 1 || z == 0 || z == sz - 1;
    }

    /** 接住渲染器吐出来的顶点。每 4 个顶点是一个面。 */
    private static final class Capture implements VertexConsumer {
        static final int STRIDE = 28;
        /**
         * 合并：同一平面上挨着的整格方块面，贴图、颜色、贴图朝向都一样的，拼成一个大面（贴图在大面上平铺）。
         * 平地、墙面、连成片的树冠本来是一格一个面，合并后面数能少一个量级；带环境光遮蔽渐变的面（棱角、墙根）颜色不一致，不合并，保持原样。
         * 先把能合并的整格面按平面攒着（planes），一块导完再拼（flush）。
         */
        boolean merge;
        /** 导出坐标的原点：面的位置存的是减过原点的，判断是不是落在整格上要加回来 */
        double baseX, baseY, baseZ;
        // 有序：Plane 的哈希里有贴图对象的身份哈希，用 HashMap 的话拼面顺序每次开游戏都不一样
        private final Map<Plane, LongOpenHashSet> planes = new LinkedHashMap<>();
        /** 哪些面是合并出来的（贴图坐标是平铺用的格数，不是图集坐标） */
        final BitSet repeat = new BitSet();
        int merged;

        /** axis：面垂直于哪根轴（0 x、1 y、2 z）；c：平面在这根轴上的坐标；sig：四个角的排列和贴图朝向 */
        private record Plane(TextureAtlasSprite sprite, int color, int axis, int c, int sig) {
        }
        private ByteBuffer buf = ByteBuffer.allocate(1 << 20).order(ByteOrder.LITTLE_ENDIAN);
        /** 每个面用的贴图，和 buf 里的面一一对应。 */
        private final List<TextureAtlasSprite> quadSprite = new ArrayList<>();
        final Set<TextureAtlasSprite> used = new LinkedHashSet<>();
        /** solid / cutout / translucent */
        final String kind;
        /** 两面都画（实体模型里不剔除背面的那些渲染类型） */
        final boolean both;
        /** 独立贴图（不在图集里的实体贴图）的显卡编号；用图集的面按小贴图找，这里是 -1 */
        final int glTex;
        /** 所在图集的全部小贴图：sprites 里找不到时到这里找（模型在渲染时才定贴图的方块、实体渲染器画的物品） */
        private final TextureAtlasSprite[] all;
        private TextureAtlasSprite lastHit;
        /** 每张实体贴图上用到的范围 [最小 u, 最小 v, 最大 u, 最大 v]，所有 Capture 共用一份 */
        private final Map<Integer, float[]> glBox;
        TextureAtlasSprite[] sprites;
        int count, lost;
        private float minU, minV, maxU, maxV;

        Capture(String kind, boolean both, int glTex, Map<Integer, float[]> glBox, TextureAtlasSprite[] all) {
            this.all = all;
            this.kind = kind;
            this.both = both;
            this.glTex = glTex;
            this.glBox = glBox;
        }
        private double ox, oy, oz;
        private float x, y, z, u, v;
        private int r = 255, g = 255, b = 255, al = 255;
        private int inQuad;
        private float su, sv;

        void offset(double x, double y, double z) {
            ox = x;
            oy = y;
            oz = z;
        }

        public VertexConsumer vertex(double px, double py, double pz) {
            x = (float) (px + ox);
            y = (float) (py + oy);
            z = (float) (pz + oz);
            return this;
        }

        public VertexConsumer color(int cr, int cg, int cb, int ca) {
            r = cr;
            g = cg;
            b = cb;
            al = ca;
            return this;
        }

        public VertexConsumer uv(float pu, float pv) {
            u = pu;
            v = pv;
            return this;
        }

        public VertexConsumer overlayCoords(int a, int b) {
            return this;
        }

        public VertexConsumer uv2(int a, int b) {
            return this;
        }

        public VertexConsumer normal(float a, float b, float c) {
            return this;
        }

        public void endVertex() {
            if (buf.remaining() < STRIDE) {
                ByteBuffer bigger = ByteBuffer.allocate(buf.capacity() * 2).order(ByteOrder.LITTLE_ENDIAN);
                buf.flip();
                bigger.put(buf);
                buf = bigger;
            }
            buf.putFloat(x).putFloat(y).putFloat(z).putFloat(u).putFloat(v);
            buf.put((byte) r).put((byte) g).put((byte) b).put((byte) al);
            buf.putInt(0);
            su += u;
            sv += v;
            if (inQuad == 0) {
                minU = maxU = u;
                minV = maxV = v;
            } else {
                minU = Math.min(minU, u);
                maxU = Math.max(maxU, u);
                minV = Math.min(minV, v);
                maxV = Math.max(maxV, v);
            }
            if (++inQuad < 4) return;
            if (glTex >= 0) {
                float[] bx = glBox.computeIfAbsent(glTex, k -> new float[]{minU, minV, maxU, maxV});
                bx[0] = Math.min(bx[0], minU);
                bx[1] = Math.min(bx[1], minV);
                bx[2] = Math.max(bx[2], maxU);
                bx[3] = Math.max(bx[3], maxV);
                inQuad = 0;
                su = sv = 0;
                count++;
                return;
            }
            // 面的中心落在哪张贴图的范围里，这个面用的就是哪张
            float cu = su / 4, cv = sv / 4;
            TextureAtlasSprite hit = null;
            if (lastHit != null && inside(lastHit, cu, cv)) hit = lastHit;
            if (hit == null && sprites != null) hit = find(sprites, cu, cv);
            if (hit == null && all != null) hit = find(all, cu, cv);
            lastHit = hit;
            inQuad = 0;
            su = sv = 0;
            if (hit == null) {
                // 对不上贴图的面（模型在渲染时才决定贴图的少数模组方块）丢掉，数量报给调用方
                buf.position(buf.position() - 4 * STRIDE);
                lost++;
                return;
            }
            used.add(hit);
            if (merge && stash(hit)) {
                buf.position(buf.position() - 4 * STRIDE);
                return;
            }
            quadSprite.add(hit);
            count++;
        }

        /** 画到一半出错时，把没凑满 4 个顶点的半个面退掉 */
        void abortQuad() {
            buf.position(buf.position() - inQuad * STRIDE);
            inQuad = 0;
            su = sv = 0;
        }

        /** 攒着等合并的整格面数 */
        int pending() {
            int n = 0;
            for (LongOpenHashSet c : planes.values()) n += c.size();
            return n;
        }

        private final int[][] corner = new int[4][3];

        /** 刚写完的这个面如果是落在整格上的整张贴图的单色方块面，就记进平面表、返回 true（调用方把它从 buf 里退掉）。 */
        private boolean stash(TextureAtlasSprite s) {
            int base = buf.position() - 4 * STRIDE;
            int color = buf.getInt(base + 20);
            int sig = 0;
            for (int k = 0; k < 4; k++) {
                int at = base + k * STRIDE;
                if (buf.getInt(at + 20) != color) return false;
                double wx = buf.getFloat(at) + baseX, wy = buf.getFloat(at + 4) + baseY, wz = buf.getFloat(at + 8) + baseZ;
                double rx = Math.rint(wx), ry = Math.rint(wy), rz = Math.rint(wz);
                if (Math.abs(wx - rx) > 1e-3 || Math.abs(wy - ry) > 1e-3 || Math.abs(wz - rz) > 1e-3) return false;
                corner[k][0] = (int) rx;
                corner[k][1] = (int) ry;
                corner[k][2] = (int) rz;
                float lu = (buf.getFloat(at + 12) - s.getU0()) / (s.getU1() - s.getU0()), lv = (buf.getFloat(at + 16) - s.getV0()) / (s.getV1() - s.getV0());
                // 游戏为了不取到邻居贴图的像素，会把贴图坐标往里缩一点点，所以留出余量
                int bu = lu < 0.03 ? 0 : lu > 0.97 ? 1 : -1, bv = lv < 0.03 ? 0 : lv > 0.97 ? 1 : -1;
                if (bu < 0 || bv < 0) return false;
                sig |= (bu << 2 | bv << 3) << (k * 4);
            }
            int axis = -1;
            for (int i = 0; i < 3; i++) {
                if (corner[0][i] == corner[1][i] && corner[1][i] == corner[2][i] && corner[2][i] == corner[3][i]) {
                    if (axis >= 0) return false;
                    axis = i;
                }
            }
            if (axis < 0) return false;
            int ia = axis == 0 ? 1 : 0, ib = axis == 2 ? 1 : 2;
            int a0 = Math.min(Math.min(corner[0][ia], corner[1][ia]), Math.min(corner[2][ia], corner[3][ia]));
            int b0 = Math.min(Math.min(corner[0][ib], corner[1][ib]), Math.min(corner[2][ib], corner[3][ib]));
            int seenPos = 0, seenUv = 0;
            for (int k = 0; k < 4; k++) {
                int da = corner[k][ia] - a0, db = corner[k][ib] - b0;
                if (da > 1 || db > 1) return false;
                sig |= (da | db << 1) << (k * 4);
                seenPos |= 1 << (da | db << 1);
                seenUv |= 1 << (sig >> (k * 4 + 2) & 3);
            }
            // 四个角各占方格的一个角、贴图的一个角，才是“一格一张贴图”的面
            if (seenPos != 15 || seenUv != 15) return false;
            planes.computeIfAbsent(new Plane(s, color, axis, corner[0][axis], sig), k -> new LongOpenHashSet()).add((long) a0 << 32 | (b0 & 0xffffffffL));
            return true;
        }

        /** 把攒着的整格面拼成尽量大的矩形写进 buf。 */
        void flush() {
            for (Map.Entry<Plane, LongOpenHashSet> e : planes.entrySet()) {
                Plane pl = e.getKey();
                LongOpenHashSet cells = e.getValue();
                long[] order = cells.toLongArray();
                java.util.Arrays.sort(order);
                int ia = pl.axis == 0 ? 1 : 0, ib = pl.axis == 2 ? 1 : 2;
                // 贴图坐标是位置的线性函数：从四个角读出“沿 a、b 各走一格，贴图坐标各变多少”
                int[] lu = new int[4], lv = new int[4];
                for (int k = 0; k < 4; k++) {
                    int bits = pl.sig >> (k * 4) & 15;
                    lu[bits & 3] = bits >> 2 & 1;
                    lv[bits & 3] = bits >> 3 & 1;
                }
                for (long cell : order) {
                    if (!cells.contains(cell)) continue;
                    int a0 = (int) (cell >> 32), b0 = (int) cell, a1 = a0, b1 = b0;
                    while (cells.contains((long) (a1 + 1) << 32 | (b0 & 0xffffffffL))) a1++;
                    grow:
                    while (true) {
                        for (int a = a0; a <= a1; a++) {
                            if (!cells.contains((long) a << 32 | ((b1 + 1) & 0xffffffffL))) break grow;
                        }
                        b1++;
                    }
                    for (int a = a0; a <= a1; a++) {
                        for (int b = b0; b <= b1; b++) cells.remove((long) a << 32 | (b & 0xffffffffL));
                    }
                    if (buf.remaining() < 4 * STRIDE) {
                        ByteBuffer bigger = ByteBuffer.allocate(buf.capacity() * 2).order(ByteOrder.LITTLE_ENDIAN);
                        buf.flip();
                        bigger.put(buf);
                        buf = bigger;
                    }
                    int w = a1 - a0 + 1, h = b1 - b0 + 1;
                    for (int k = 0; k < 4; k++) {
                        int bits = pl.sig >> (k * 4) & 15, da = bits & 1, db = bits >> 1 & 1;
                        int ea = da * w, eb = db * h;
                        double[] pos = new double[3];
                        pos[pl.axis] = pl.c;
                        pos[ia] = a0 + ea;
                        pos[ib] = b0 + eb;
                        buf.putFloat((float) (pos[0] - baseX)).putFloat((float) (pos[1] - baseY)).putFloat((float) (pos[2] - baseZ));
                        buf.putFloat(lu[0] + (lu[1] - lu[0]) * ea + (lu[2] - lu[0]) * eb).putFloat(lv[0] + (lv[1] - lv[0]) * ea + (lv[2] - lv[0]) * eb);
                        buf.putInt(pl.color).putInt(0);
                    }
                    if (w * h > 1) merged += w * h - 1;
                    repeat.set(count);
                    quadSprite.add(pl.sprite);
                    count++;
                }
            }
            planes.clear();
        }

        private static boolean inside(TextureAtlasSprite s, float u, float v) {
            return u >= s.getU0() && u <= s.getU1() && v >= s.getV0() && v <= s.getV1();
        }

        private static TextureAtlasSprite find(TextureAtlasSprite[] list, float u, float v) {
            for (TextureAtlasSprite s : list) {
                if (inside(s, u, v)) return s;
            }
            return null;
        }

        public void defaultColor(int a, int b, int c, int d) {
        }

        public void unsetDefaultColor() {
        }

        /** 把贴图坐标从来源图换到导出的小图集（就地改），写出去，返回写了多少字节。 */
        long write(OutputStream os, Map<Object, int[]> place, Map<Object, int[]> src, int w, int h, Map<TextureAtlasSprite, Integer> rectIndex) throws IOException {
            ByteBuffer out = buf;
            for (int q = 0; q < count; q++) {
                TextureAtlasSprite s = glTex >= 0 ? null : quadSprite.get(q);
                Object key = s == null ? (Object) glTex : s;
                int[] p = place.get(key), r = src.get(key);
                if (repeat.get(q)) {
                    // 合并出来的面：贴图坐标留着格数不动，只记它用的是贴图表里的第几张（+1，0 表示普通面）
                    int idx = rectIndex.computeIfAbsent(s, k -> rectIndex.size()) + 1;
                    for (int k = 0; k < 4; k++) out.putInt((q * 4 + k) * STRIDE + 24, idx);
                    continue;
                }
                for (int k = 0; k < 4; k++) {
                    int at = (q * 4 + k) * STRIDE + 12;
                    float pu, pv;
                    if (s != null) {
                        // 面上的坐标是游戏大图集里的 0~1，先换成这张贴图内的像素
                        pu = (out.getFloat(at) - s.getU0()) / (s.getU1() - s.getU0()) * r[2];
                        pv = (out.getFloat(at + 4) - s.getV0()) / (s.getV1() - s.getV0()) * r[3];
                    } else {
                        pu = out.getFloat(at) * r[4] - r[0];
                        pv = out.getFloat(at + 4) * r[5] - r[1];
                    }
                    out.putFloat(at, (p[0] + pu) / w);
                    out.putFloat(at + 4, (p[1] + pv) / h);
                }
            }
            int len = count * 4 * STRIDE;
            os.write(buf.array(), 0, len);
            return len;
        }
    }

    /** 不要的渲染类型（影子、文字）写到这里，什么也不留。 */
    private static final class Sink implements VertexConsumer {
        public VertexConsumer vertex(double x, double y, double z) {
            return this;
        }

        public VertexConsumer color(int r, int g, int b, int a) {
            return this;
        }

        public VertexConsumer uv(float u, float v) {
            return this;
        }

        public VertexConsumer overlayCoords(int a, int b) {
            return this;
        }

        public VertexConsumer uv2(int a, int b) {
            return this;
        }

        public VertexConsumer normal(float a, float b, float c) {
            return this;
        }

        public void endVertex() {
        }

        public void defaultColor(int a, int b, int c, int d) {
        }

        public void unsetDefaultColor() {
        }
    }

    /** 和原世界一样，只是朝向明暗恒为 1。 */
    private record NoShade(ClientLevel level) implements BlockAndTintGetter {
        public float getShade(Direction direction, boolean shade) {
            return 1;
        }

        public LevelLightEngine getLightEngine() {
            return level.getLightEngine();
        }

        public int getBlockTint(BlockPos pos, ColorResolver resolver) {
            // 不做群系之间的颜色过渡（游戏默认把周围几格的群系色混起来，每格都差一点点）：
            // 同一群系里草和树叶颜色完全一样，挨着的面才能合并；过渡带在参考模型里看不出区别
            return resolver.getColor(level.getBiome(pos).value(), pos.getX(), pos.getZ());
        }

        public BlockEntity getBlockEntity(BlockPos pos) {
            return level.getBlockEntity(pos);
        }

        public BlockState getBlockState(BlockPos pos) {
            return level.getBlockState(pos);
        }

        public FluidState getFluidState(BlockPos pos) {
            return level.getFluidState(pos);
        }

        public int getHeight() {
            return level.getHeight();
        }

        public int getMinBuildHeight() {
            return level.getMinBuildHeight();
        }
    }
}
