import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import mcai.gamedata.BiomeSource;
import mcai.gamedata.BiomeTable;
import mcai.gamedata.BlockSource;
import mcai.gamedata.BlockTable;
import mcai.gamedata.GameData;
import mcai.gamedata.Png;
import mcai.gamedata.TintProbe;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * mcai biomes / blocks 出表部分（mcai.gamedata，不碰游戏类）的离线核对：sh test/game-data-test.sh。
 * 用假的 GameData 喂数据，查：面的坐标换算、顶点顺序和手写方块表一致（石头的六个面逐字对上旧表）；草方块的叠加层合并；
 * 随机转只认 4 个朝向且不镜像；染色路的暗号判断；群系定值 / 随位置；PNG 能读回同样的像素；贴图缩到 16×16 是面积平均。
 */
public class GameDataTest {
    static int failed;

    public static void main(String[] args) throws Exception {
        cubeMatchesHandTable();
        grassOverlayMerges();
        spinNeedsFourTurnsWithoutMirror();
        tintRoutes();
        biomeTable();
        pngRoundTrip();
        boxDownsample();
        if (failed > 0) {
            System.out.println(failed + " 项没过");
            System.exit(1);
        }
        System.out.println("全部通过");
    }

    static void check(boolean ok, String what) {
        if (!ok) {
            failed++;
            System.out.println("没过：" + what);
        }
    }

    // ---------- 假数据 ----------
    /** 游戏 FaceBakery 的 FaceInfo 顶点顺序（DOWN UP NORTH SOUTH WEST EAST），每项是四个角的 [x, y, z]（0 或 1） */
    static final int[][][] FACE_INFO = {
            {{0, 0, 1}, {0, 0, 0}, {1, 0, 0}, {1, 0, 1}},
            {{0, 1, 0}, {0, 1, 1}, {1, 1, 1}, {1, 1, 0}},
            {{1, 1, 0}, {1, 0, 0}, {0, 0, 0}, {0, 1, 0}},
            {{0, 1, 1}, {0, 0, 1}, {1, 0, 1}, {1, 1, 1}},
            {{0, 1, 0}, {0, 0, 0}, {0, 0, 1}, {0, 1, 1}},
            {{1, 1, 1}, {1, 0, 1}, {1, 0, 0}, {1, 1, 0}}};
    static final String[] DIRS = {"down", "up", "north", "south", "west", "east"};

    /** 整格方块的一个面，uv 照 FaceBakery：v0 (u1,v1)、v1 (u1,v2)、v2 (u2,v2)、v3 (u2,v1)，默认 [0,0,16,16] */
    static BlockSource.Quad cubeFace(int d, String sprite, int tint) {
        float[] pos = new float[12];
        for (int i = 0; i < 4; i++) for (int k = 0; k < 3; k++) pos[i * 3 + k] = FACE_INFO[d][i][k];
        float[] uv = {0, 0, 0, 16, 16, 16, 16, 0};
        return new BlockSource.Quad(pos, uv, sprite, tint, true, DIRS[d]);
    }

    record FakeBlocks(Map<String, BlockSource.Model> models) implements BlockSource {
        public List<String> states() {
            return new ArrayList<>(models.keySet());
        }

        public Model model(String state) {
            return models.get(state);
        }

        public Texture texture(String sprite) {
            return sprite.equals("minecraft:missingno") ? null : new Texture(16, 16, new int[256]);
        }
    }

    static final GameData NO_GAME = new GameData() {
        public String gameVersion() {
            return "测试";
        }

        public Map<String, String> mods() {
            return Map.of("minecraft", "1.20.1");
        }

        public List<String> resourcePacks() {
            return List.of("vanilla");
        }

        public BiomeSource biomes() {
            return null;
        }

        public BlockSource blocks() {
            return null;
        }
    };

    static BlockSource.Model solid(List<BlockSource.Quad> quads, Map<Integer, String> tints, List<List<BlockSource.Quad>> variants) {
        return new BlockSource.Model(BlockSource.Layer.SOLID, true, true, true, 0, null, List.of(quads), variants, tints, null, null, "测试");
    }

    static Set<String> faceSet(JsonArray faces) {
        Set<String> s = new HashSet<>();
        faces.forEach(f -> s.add(f.toString()));
        return s;
    }

    // ---------- 用例 ----------
    static void cubeMatchesHandTable() {
        List<BlockSource.Quad> quads = new ArrayList<>();
        for (int d = 0; d < 6; d++) quads.add(cubeFace(d, "minecraft:block/stone", -1));
        BlockTable.Result r = BlockTable.build(NO_GAME, new FakeBlocks(Map.of("minecraft:stone", solid(quads, Map.of(), List.of(quads)))), s -> true, null);
        JsonObject j = r.json();
        // 旧表（数据/场景/关键帧/方块表）里 minecraft:stone 的面组，贴图号换成 0
        JsonArray hand = JsonParser.parseString("[[\"-z\",\"-z\",0,-1,0,1,0,0,0,16,0,0,16,16,0,0,16,0,0,0,16,0,16,16,0,16],[\"+z\",\"+z\",0,-1,0,1,0,16,16,16,16,16,16,0,16,0,0,16,0,0,16,0,16,16,0,16],"
                + "[\"+y\",\"+y\",0,-1,0,1,16,16,16,0,16,16,0,16,0,16,16,0,0,0,16,0,16,16,0,16],[\"-y\",\"-y\",0,-1,0,1,0,0,16,16,0,16,16,0,0,0,0,0,0,0,16,0,16,16,0,16],"
                + "[\"-x\",\"-x\",0,-1,0,1,0,16,16,0,0,16,0,0,0,0,16,0,0,0,16,0,16,16,0,16],[\"+x\",\"+x\",0,-1,0,1,16,0,16,16,16,16,16,16,0,16,0,0,0,0,16,0,16,16,0,16]]").getAsJsonArray();
        JsonArray got = j.getAsJsonArray("面组").get(0).getAsJsonArray();
        check(faceSet(got).equals(faceSet(hand)), "石头六个面和手写表一致：" + got);
        // 标志 = solid 0 + 满 4 + 遮 8 + 光 16 = 28，同旧表
        check(j.getAsJsonObject("方块").getAsJsonArray("minecraft:stone").get(0).getAsInt() == 28, "石头标志 28");
        check(j.getAsJsonArray("贴图").get(0).getAsString().equals("minecraft:block/stone"), "贴图名");
    }

    static void grassOverlayMerges() {
        List<BlockSource.Quad> quads = new ArrayList<>();
        quads.add(cubeFace(2, "minecraft:block/grass_block_side", -1));
        quads.add(cubeFace(2, "minecraft:block/grass_block_side_overlay", 0));
        quads.add(cubeFace(1, "minecraft:block/grass_block_top", 0));
        quads.add(cubeFace(0, "minecraft:missingno", -1));
        BlockTable.Result r = BlockTable.build(NO_GAME, new FakeBlocks(Map.of("minecraft:grass_block[snowy=false]", solid(quads, Map.of(0, "grass"), List.of(quads)))), s -> true, null);
        JsonArray faces = r.json().getAsJsonArray("面组").get(0).getAsJsonArray();
        check(faces.size() == 2, "侧面叠加层并进底面、缺贴图的面不导：" + faces);
        JsonArray side = faces.get(0).getAsJsonArray();
        check(side.get(3).getAsInt() == 1 && side.get(4).getAsInt() == 0, "侧面 叠加贴图 = 1、本身不染：" + side);
        check(faces.get(1).getAsJsonArray().get(4).getAsInt() == 1, "顶面染色");
        check(r.json().getAsJsonObject("方块").getAsJsonArray("minecraft:grass_block[snowy=false]").get(1).getAsString().equals("grass"), "染色路 grass");
        check(r.warnings().stream().anyMatch(w -> w.contains("missingno")), "缺贴图进提醒");
    }

    /** 朝上的面，uv 绕中心转 k 个 90°（mirror 时左右翻） */
    static BlockSource.Quad turnedTop(int k, boolean mirror) {
        BlockSource.Quad q = cubeFace(1, "t", -1);
        float[] uv = q.uv().clone();
        for (int i = 0; i < 4; i++) {
            float u = uv[i * 2] - 8, v = uv[i * 2 + 1] - 8;
            if (mirror) u = -u;
            for (int t = 0; t < k; t++) {
                float nu = -v, nv = u;
                u = nu;
                v = nv;
            }
            uv[i * 2] = u + 8;
            uv[i * 2 + 1] = v + 8;
        }
        return new BlockSource.Quad(q.pos(), uv, "t", -1, true, "up");
    }

    static void spinNeedsFourTurnsWithoutMirror() {
        List<List<BlockSource.Quad>> four = new ArrayList<>();
        for (int k = 0; k < 4; k++) four.add(List.of(turnedTop(k, false)));
        BlockSource.Model spin = solid(four.get(0), Map.of(), four);
        List<List<BlockSource.Quad>> stone = List.of(List.of(turnedTop(0, false)), List.of(turnedTop(0, true)), List.of(turnedTop(2, false)), List.of(turnedTop(2, true)));
        BlockSource.Model mirrored = solid(stone.get(0), Map.of(), stone);
        BlockTable.Result r = BlockTable.build(NO_GAME, new FakeBlocks(Map.of("a:spin", spin, "a:mirror", mirrored)), s -> true, null);
        JsonObject b = r.json().getAsJsonObject("方块");
        check((b.getAsJsonArray("a:spin").get(0).getAsInt() & 32) != 0, "4 个朝向算随机转");
        check((b.getAsJsonArray("a:mirror").get(0).getAsInt() & 32) == 0, "带镜像的不算随机转");
        check(r.json().getAsJsonObject("附加").getAsJsonObject("变体数").get("a:spin").getAsInt() == 4, "变体数记下");
    }

    static void tintRoutes() {
        check(TintProbe.route(set -> -1, "x") == null, "没注册染色函数 → null");
        check("grass".equals(TintProbe.route(set -> TintProbe.sentinel(set, 0) | 0xff000000, "x")), "原样回草的暗号 → grass");
        check("water".equals(TintProbe.route(set -> TintProbe.sentinel(set, 2), "x")), "水的暗号 → water");
        check("#619961".equals(TintProbe.route(set -> 0x619961, "x")), "两次一样 → 定值");
        check("动态:canopy".equals(TintProbe.route(set -> TintProbe.sentinel(set, 1) + 0x100, "canopy")), "改过暗号 → 动态");
    }

    static void biomeTable() {
        BiomeSource src = new BiomeSource() {
            public List<String> ids() {
                return List.of("a:plain", "a:swamp");
            }

            public Info info(String id) {
                return new Info(0.8f, 0.4f, true, "none", 0x78a7ff, 0xc0d8ff, 0x3f76e4, 0x050533, null, null, id.equals("a:swamp") ? "swamp" : "none", 0x91bd59, 0x77ab2f);
            }

            public int color(String id, Channel ch, int x, int z) {
                if (id.equals("a:swamp") && ch == Channel.GRASS) return x < 0 ? 0x4c763c : 0x6a7039;
                return ch == Channel.WATER ? 0x3f76e4 : ch == Channel.GRASS ? 0x91bd59 : 0x77ab2f;
            }
        };
        JsonObject t = BiomeTable.build(NO_GAME, src, 32, null);
        JsonObject plain = t.getAsJsonObject("群系").getAsJsonObject("a:plain"), swamp = t.getAsJsonObject("群系").getAsJsonObject("a:swamp");
        check(plain.get("草").getAsString().equals("#91bd59") && !plain.has("草修饰") && !plain.has("采样"), "定值群系：" + plain);
        check(swamp.get("草修饰").getAsString().equals("swamp") && swamp.get("草").getAsString().equals("#91bd59"), "随位置的草写底色和修饰：" + swamp);
        check(swamp.getAsJsonObject("采样").getAsJsonArray("草").size() == 32 && t.getAsJsonArray("采样点").size() == 32, "采样个数");
        check(!swamp.has("叶修饰"), "树叶不随位置变就不写叶修饰");
        int[][] a = BiomeTable.samplePoints(64), b = BiomeTable.samplePoints(64);
        check(java.util.Arrays.deepEquals(a, b), "采样点固定");
    }

    static void pngRoundTrip() throws Exception {
        int[] px = {0xff102030, 0x80ffffff, 0x00000000, 0xff00ff00, 0x7f123456, 0xffabcdef};
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(Png.encode(2, 3, px)));
        boolean same = img.getWidth() == 2 && img.getHeight() == 3;
        for (int i = 0; i < px.length && same; i++) same = img.getRGB(i % 2, i / 2) == px[i];
        check(same, "PNG 读回同样的像素");
        check(java.util.Arrays.equals(Png.encode(2, 3, px), Png.encode(2, 3, px)), "PNG 字节固定");
    }

    static void boxDownsample() throws Exception {
        // 32×32：每 2×2 一块，左上 3 个白、1 个黑 → 缩完每格 (255×3)/4 = 191.25 → 191
        int[] big = new int[32 * 32];
        for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) big[y * 32 + x] = (x % 2 == 1 && y % 2 == 1) ? 0xff000000 : 0xffffffff;
        java.lang.reflect.Method box = BlockTable.class.getDeclaredMethod("box", int[].class, int.class, int.class, int.class, int.class);
        box.setAccessible(true);
        int[] small = (int[]) box.invoke(null, big, 32, 32, 16, 16);
        check(small.length == 256 && small[0] == 0xffbfbfbf && small[255] == 0xffbfbfbf, "面积平均：" + Integer.toHexString(small[0]));
        int[] tiny = {0xff111111, 0xff222222, 0xff333333, 0xff444444};
        int[] up = (int[]) box.invoke(null, tiny, 2, 2, 16, 16);
        check(up[0] == 0xff111111 && up[15] == 0xff222222 && up[255] == 0xff444444, "放大就近");
    }
}
