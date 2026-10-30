package mcai.gamedata;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Predicate;

/**
 * 方块表：和手写的 方块表.json / 方块表.png（sourcing/extract/关键帧方块.py）同结构，面取自游戏烘焙好的模型，不自己解析 blockstates 和模型文件。
 *   贴图 [名字]、面组 [[面…]]（一组 = 一个部件的全部面，状态间共用）、方块 {状态: [标志, 染, 面组号…]}；
 *   标志 = 类(0 solid/1 cutout/2 translucent/3 liquid) + 4 满 + 8 遮 + 16 光 + 32 转 + 64 偏；
 *   面 [朝向, 剔除方向, 贴图, 叠加贴图(-1 无), 染, 明暗, 四角 xyz, 四角 uv]：场景坐标（北 = +y、上 = +z），坐标和 uv 以 1/16 格为单位。
 *   png：每张贴图第一帧缩到 16×16，按贴图号竖排。
 * 和手写表的差别（都按游戏为准）：状态全导（手写表只导一部分）；类按游戏的渲染层，不按贴图透明度猜；遮按碰撞箱是不是整格；
 *   偏按方块有没有随机偏移；朝向按面的实际法线（手写表里元素带旋转的面一律不写朝向）；顶点从同一个角起头（手写表按模型里的面起头，转过的面起点会差一格）。
 * 「附加」放手写表没有的：发光、偏移种类、随机变体数、多个染色索引、不画的方块；「统计」给核对用。
 */
public final class BlockTable {
    private BlockTable() {
    }

    /** 液面高度：水源上面是空气时游戏画在 8/9 格（LiquidBlockRenderer），和手写表一样 */
    static final double LIQUID_TOP = 16 * 8 / 9.0;
    private static final String[] LAYER_NAMES = {"solid", "cutout", "translucent", "liquid"};

    public record Result(JsonObject json, List<String> textures, Map<String, BlockSource.Texture> pixels, List<String> warnings) {
    }

    public static Result build(GameData game, BlockSource src, Predicate<String> keep, JsonObject params) {
        Builder b = new Builder(src);
        for (String state : src.states()) {
            if (keep.test(state)) b.add(state);
        }
        JsonObject out = new JsonObject();
        out.addProperty("说明", "mcai blocks 从游戏烘焙好的方块模型导出的方块表，不要手改；结构见 sourcing/mod/src/main/java/mcai/gamedata/BlockTable.java 文件头");
        out.add("取材", BiomeTable.provenance(game, params));
        JsonArray tex = new JsonArray();
        b.textures.forEach(tex::add);
        out.add("贴图", tex);
        JsonArray groups = new JsonArray();
        b.groups.forEach(groups::add);
        out.add("面组", groups);
        out.add("方块", b.blocks);
        JsonObject extra = new JsonObject();
        extra.add("发光", b.light);
        extra.add("偏移", b.offset);
        extra.add("变体数", b.variants);
        extra.add("多染", b.multiTint);
        // 一个状态都没画出来的方块（空气、箱子这类方块实体画的）
        JsonArray notDrawn = new JsonArray();
        b.seenBlocks.stream().filter(k -> !b.drawnBlocks.contains(k)).sorted().forEach(notDrawn::add);
        extra.add("不画", notDrawn);
        out.add("附加", extra);
        JsonObject stats = new JsonObject();
        stats.addProperty("状态", b.blocks.size());
        stats.addProperty("面组", b.groups.size());
        stats.addProperty("贴图", b.textures.size());
        stats.addProperty("不画的状态", b.notDrawnStates);
        JsonObject renderers = new JsonObject();
        b.renderers.forEach(renderers::addProperty);
        stats.add("模型类", renderers);
        out.add("统计", stats);
        List<String> warnings = new ArrayList<>();
        // 体素网格（engine/voxel/网格.ts）把贴图号塞进 12 位、体素值是 16 位：全量表超了不能直接给它用，要先按世界里出现的状态裁
        if (b.textures.size() >= 4096) warnings.add("贴图 " + b.textures.size() + " 张，超过体素网格贴图号的 4095");
        if (b.blocks.size() >= 65535) warnings.add("方块状态 " + b.blocks.size() + " 种，超过 16 位体素值");
        if (!b.errors.isEmpty()) {
            warnings.add("取模型出错的状态 " + b.errors.size() + " 个（记成不画）：" + String.join("；", b.errors.entrySet().stream().limit(20).map(e -> e.getKey() + " " + e.getValue()).toList()));
            JsonObject err = new JsonObject();
            b.errors.forEach(err::addProperty);
            extra.add("出错", err);
        }
        if (!b.missingTextures.isEmpty()) warnings.add("取不到像素的贴图 " + b.missingTextures.size() + " 张（这些面不导）：" + String.join("、", b.missingTextures));
        return new Result(out, b.textures, b.pixels, warnings);
    }

    private static final class Builder {
        final BlockSource src;
        final List<String> textures = new ArrayList<>();
        final Map<String, Integer> texIndex = new HashMap<>();
        final Map<String, BlockSource.Texture> pixels = new HashMap<>();
        final Set<String> missingTextures = new TreeSet<>();
        final List<JsonArray> groups = new ArrayList<>();
        final Map<String, Integer> groupIndex = new HashMap<>();
        final JsonObject blocks = new JsonObject(), light = new JsonObject(), offset = new JsonObject(), variants = new JsonObject(), multiTint = new JsonObject();
        final Set<String> drawnBlocks = new HashSet<>();
        final Set<String> seenBlocks = new LinkedHashSet<>();
        final Map<String, Integer> renderers = new TreeMap<>();
        final Map<String, String> errors = new TreeMap<>();
        int notDrawnStates;

        Builder(BlockSource src) {
            this.src = src;
        }

        Integer texture(String sprite) {
            Integer i = texIndex.get(sprite);
            if (i != null) return i;
            if (missingTextures.contains(sprite)) return null;
            BlockSource.Texture t = src.texture(sprite);
            if (t == null) {
                missingTextures.add(sprite);
                return null;
            }
            texIndex.put(sprite, textures.size());
            textures.add(sprite);
            pixels.put(sprite, t);
            return textures.size() - 1;
        }

        int group(JsonArray faces) {
            String key = faces.toString();
            Integer i = groupIndex.get(key);
            if (i != null) return i;
            groupIndex.put(key, groups.size());
            groups.add(faces);
            return groups.size() - 1;
        }

        void add(String state) {
            String block = blockId(state);
            seenBlocks.add(block);
            BlockSource.Model m;
            try {
                m = src.model(state);
            } catch (RuntimeException | LinkageError e) {
                // 模组的模型在假世界、空 ModelData 下可能抛：这个状态记成不画，不让一个状态拖垮整张表
                errors.put(state, e.getClass().getSimpleName() + ": " + e.getMessage());
                renderers.merge("出错:" + e.getClass().getSimpleName(), 1, Integer::sum);
                skip();
                return;
            }
            renderers.merge(m.renderer(), 1, Integer::sum);
            List<Integer> ids = new ArrayList<>();
            int cls;
            String tint;
            if (m.layer() == BlockSource.Layer.LIQUID) {
                Integer t = m.liquidSprite() == null ? null : texture(m.liquidSprite());
                if (t == null) {
                    skip();
                    return;
                }
                JsonArray face = new JsonArray();
                face.add("+z");
                face.add("+z");
                face.add(t);
                face.add(-1);
                face.add(m.liquidTint() != null ? 1 : 0);
                face.add(1);
                double h = LIQUID_TOP;
                for (double[] c : new double[][]{{0, 16, h}, {16, 16, h}, {16, 0, h}, {0, 0, h}}) for (double v : c) face.add(q(v));
                for (int v : new int[]{0, 0, 16, 0, 16, 16, 0, 16}) face.add(v);
                JsonArray g = new JsonArray();
                g.add(face);
                ids.add(group(g));
                cls = 3;
                tint = m.liquidTint();
                // 和手写表一样：液体不算满、不算遮，要环境光遮蔽，不随机转、不偏
                blocks.add(state, flags(cls, false, false, true, false, false, tint, ids));
                drawnBlocks.add(block);
                return;
            }
            for (List<BlockSource.Quad> part : m.parts()) {
                JsonArray faces = faces(part);
                if (!faces.isEmpty()) ids.add(group(faces));
            }
            if (ids.isEmpty()) {
                skip();
                return;
            }
            cls = m.layer().ordinal();
            tint = null;
            int minTint = Integer.MAX_VALUE;
            for (Integer idx : m.tints().keySet()) minTint = Math.min(minTint, idx);
            if (minTint != Integer.MAX_VALUE) tint = m.tints().get(minTint);
            boolean spin = spins(m.variants());
            blocks.add(state, flags(cls, m.opaqueFull() && cls == 0, m.fullCollision(), m.ambientOcclusion(), spin, m.offset() != null, tint, ids));
            drawnBlocks.add(block);
            if (m.lightEmission() > 0) light.addProperty(state, m.lightEmission());
            if (m.offset() != null) offset.addProperty(state, m.offset());
            if (m.variants().size() > 1) variants.addProperty(state, m.variants().size());
            if (new HashSet<>(m.tints().values()).size() > 1) {
                JsonObject t = new JsonObject();
                new TreeMap<>(m.tints()).forEach((k, v) -> t.addProperty(String.valueOf(k), v));
                multiTint.add(state, t);
            }
        }

        void skip() {
            notDrawnStates++;
        }

        JsonArray faces(List<BlockSource.Quad> quads) {
            List<JsonArray> merged = new ArrayList<>();
            for (BlockSource.Quad quad : quads) {
                Integer t = texture(quad.sprite());
                if (t == null) continue;
                JsonArray f = face(quad, t);
                // 草方块：同一位置上带染色的那层边并成前一个不染色面的叠加层（同手写表）
                JsonArray same = null;
                for (JsonArray g : merged) {
                    if (g.get(3).getAsInt() < 0 && samePositions(g, f)) {
                        same = g;
                        break;
                    }
                }
                if (same != null && f.get(4).getAsInt() == 1 && same.get(4).getAsInt() == 0) {
                    same.set(3, new JsonPrimitive(t));
                    continue;
                }
                merged.add(f);
            }
            JsonArray out = new JsonArray();
            merged.forEach(out::add);
            return out;
        }
    }

    private static JsonArray flags(int cls, boolean full, boolean collide, boolean ao, boolean spin, boolean offset, String tint, List<Integer> ids) {
        JsonArray a = new JsonArray();
        a.add(cls + (full ? 4 : 0) + (collide ? 8 : 0) + (ao ? 16 : 0) + (spin ? 32 : 0) + (offset ? 64 : 0));
        if (tint == null) a.add(com.google.gson.JsonNull.INSTANCE);
        else a.add(tint);
        ids.forEach(a::add);
        return a;
    }

    static String blockId(String state) {
        int i = state.indexOf('[');
        return i < 0 ? state : state.substring(0, i);
    }

    /** 游戏方向名 → 场景方向（场景 (X, Y, Z) = 游戏 (x, -z, y)） */
    static String sceneDir(String mcDir) {
        if (mcDir == null) return "";
        return switch (mcDir) {
            case "up" -> "+z";
            case "down" -> "-z";
            case "north" -> "+y";
            case "south" -> "-y";
            case "east" -> "+x";
            case "west" -> "-x";
            default -> "";
        };
    }

    /**
     * 一个面 → [朝向, 剔除方向, 贴图, -1, 染, 明暗, 四角 xyz, 四角 uv]。
     * 角的顺序：游戏烘焙顺序是从外面看逆时针 v0 v1 v2 v3，手写表绕的方向相反，写成 v0 v3 v2 v1。
     */
    static JsonArray face(BlockSource.Quad quad, int tex) {
        float[] p = quad.pos(), uv = quad.uv();
        JsonArray f = new JsonArray();
        f.add(normalDir(p));
        f.add(sceneDir(quad.cull()));
        f.add(tex);
        f.add(-1);
        f.add(quad.tintIndex() >= 0 ? 1 : 0);
        f.add(quad.shade() ? 1 : 0);
        int[] order = {0, 3, 2, 1};
        for (int i : order) {
            f.add(q(16.0 * p[i * 3]));
            f.add(q(16.0 * (1 - (double) p[i * 3 + 2])));
            f.add(q(16.0 * p[i * 3 + 1]));
        }
        for (int i : order) {
            f.add(q(snapUv(uv[i * 2])));
            f.add(q(snapUv(uv[i * 2 + 1])));
        }
        return f;
    }

    /** 面的法线（按游戏顶点顺序 (v1 - v0) × (v2 - v0)）正对某根轴就写那个场景方向，斜的写空串 */
    static String normalDir(float[] p) {
        double ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2];
        double bx = p[6] - p[0], by = p[7] - p[1], bz = p[8] - p[2];
        double nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        double len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-9) return "";
        nx /= len;
        ny /= len;
        nz /= len;
        double e = 1e-4;
        if (Math.abs(nx) > 1 - e) return nx > 0 ? "+x" : "-x";
        if (Math.abs(ny) > 1 - e) return ny > 0 ? "+z" : "-z";
        if (Math.abs(nz) > 1 - e) return nz > 0 ? "-y" : "+y";
        return "";
    }

    private static boolean samePositions(JsonArray a, JsonArray b) {
        for (int i = 6; i < 18; i++) {
            if (!a.get(i).equals(b.get(i))) return false;
        }
        return true;
    }

    /** 模型里的 uv 多是 1/64 像素的整数倍；图集浮点算回来差一点的贴回去，免得 7.9996 写成 8.0 以外的数 */
    static double snapUv(double v) {
        double g = Math.rint(v * 64) / 64;
        return Math.abs(g - v) < 2e-3 ? g : v;
    }

    /** 坐标、uv：整数写成整数，其余留三位小数（同手写表的 q） */
    static JsonPrimitive q(double v) {
        double r = Math.round(v * 1000) / 1000.0;
        if (r == Math.rint(r)) return new JsonPrimitive((long) r);
        return new JsonPrimitive(r);
    }

    /**
     * 随机转：4 个随机变体几何和贴图都一样，只差贴图朝向（朝上那面的贴图转了 4 个不同的 90°，且都不是镜像）。
     * 同手写表「4 个只差 y 旋转的同一模型」；原版石头那种「两个模型各转 0°、180°」带镜像，不算。
     */
    static boolean spins(List<List<BlockSource.Quad>> variants) {
        if (variants.size() != 4) return false;
        String geometry = null;
        Set<Integer> turns = new HashSet<>();
        Set<Boolean> mirrored = new HashSet<>();
        for (List<BlockSource.Quad> v : variants) {
            String g = geometry(v);
            if (geometry == null) geometry = g;
            else if (!geometry.equals(g)) return false;
            BlockSource.Quad top = null;
            for (BlockSource.Quad quad : v) {
                if ("+z".equals(normalDir(quad.pos())) && (top == null || area(quad) > area(top))) top = quad;
            }
            if (top == null) return false;
            double[] m = uvMap(top);
            if (m == null) return false;
            turns.add(Math.floorMod((int) Math.round(Math.atan2(m[1], m[0]) / (Math.PI / 2)), 4));
            mirrored.add(m[0] * m[3] - m[1] * m[2] < 0);
        }
        return turns.size() == 4 && mirrored.size() == 1;
    }

    /** 一个变体的几何签名：每个面的贴图和四角位置（不管顺序），排好序拼起来 */
    private static String geometry(List<BlockSource.Quad> quads) {
        List<String> faces = new ArrayList<>();
        for (BlockSource.Quad quad : quads) {
            List<String> corners = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                corners.add(Math.round(quad.pos()[i * 3] * 1600) + "," + Math.round(quad.pos()[i * 3 + 1] * 1600) + "," + Math.round(quad.pos()[i * 3 + 2] * 1600));
            }
            corners.sort(null);
            faces.add(quad.sprite() + ":" + String.join(";", corners));
        }
        faces.sort(null);
        return String.join("|", faces);
    }

    private static double area(BlockSource.Quad quad) {
        float[] p = quad.pos();
        double ax = p[3] - p[0], az = p[5] - p[2], bx = p[9] - p[0], bz = p[11] - p[2];
        return Math.abs(ax * bz - az * bx);
    }

    /** 朝上的面：游戏 (x, z) → (u, v) 的线性部分 [du/dx, du/dz, dv/dx, dv/dz]，退化返回 null */
    private static double[] uvMap(BlockSource.Quad quad) {
        float[] p = quad.pos(), uv = quad.uv();
        double x1 = p[3] - p[0], z1 = p[5] - p[2], x2 = p[6] - p[0], z2 = p[8] - p[2];
        double u1 = uv[2] - uv[0], v1 = uv[3] - uv[1], u2 = uv[4] - uv[0], v2 = uv[5] - uv[1];
        double det = x1 * z2 - x2 * z1;
        if (Math.abs(det) < 1e-9) return null;
        return new double[]{(u1 * z2 - u2 * z1) / det, (x1 * u2 - x2 * u1) / det, (v1 * z2 - v2 * z1) / det, (x1 * v2 - x2 * v1) / det};
    }

    /** 贴图 → 16×16（面积平均，同 PIL 的 BOX；小于 16 的就近放大），再按贴图号竖排成一张 16 × 16N 的图 */
    public static int[] strip(List<String> textures, Map<String, BlockSource.Texture> pixels) {
        int[] out = new int[16 * 16 * textures.size()];
        for (int i = 0; i < textures.size(); i++) {
            BlockSource.Texture t = pixels.get(textures.get(i));
            int[] px = box(t.argb(), t.width(), t.height(), 16, 16);
            System.arraycopy(px, 0, out, i * 256, 256);
        }
        return out;
    }

    static int[] box(int[] argb, int w, int h, int ow, int oh) {
        int[] out = new int[ow * oh];
        for (int oy = 0; oy < oh; oy++) {
            double y0 = (double) oy * h / oh, y1 = (double) (oy + 1) * h / oh;
            for (int ox = 0; ox < ow; ox++) {
                double x0 = (double) ox * w / ow, x1 = (double) (ox + 1) * w / ow;
                double[] sum = new double[4];
                double area = 0;
                for (int y = (int) Math.floor(y0); y < Math.min(h, (int) Math.ceil(y1)); y++) {
                    double wy = Math.min(y + 1, y1) - Math.max(y, y0);
                    for (int x = (int) Math.floor(x0); x < Math.min(w, (int) Math.ceil(x1)); x++) {
                        double wgt = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
                        int c = argb[y * w + x];
                        sum[0] += wgt * (c >>> 24);
                        sum[1] += wgt * (c >> 16 & 0xff);
                        sum[2] += wgt * (c >> 8 & 0xff);
                        sum[3] += wgt * (c & 0xff);
                        area += wgt;
                    }
                }
                int a = (int) Math.floor(sum[0] / area + 0.5), r = (int) Math.floor(sum[1] / area + 0.5);
                int g = (int) Math.floor(sum[2] / area + 0.5), b = (int) Math.floor(sum[3] / area + 0.5);
                out[oy * ow + ox] = a << 24 | r << 16 | g << 8 | b;
            }
        }
        return out;
    }
}
