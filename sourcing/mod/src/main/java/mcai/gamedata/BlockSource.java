package mcai.gamedata;

import java.util.List;
import java.util.Map;

/** 取方块模型：游戏烘焙好的面（方块状态的旋转、uvlock、模组模型、资源包覆盖都已算进去）。 */
public interface BlockSource {
    /** 全部方块状态，写成 id[属性=值,…]（属性按名排，没有属性就只有 id）；方块按 id 排，同一方块默认状态在前 */
    List<String> states();

    /** 一个方块状态的模型。方块渲染器不画的（空气、箱子这类方块实体画的）返回 parts 为空的 Model */
    Model model(String state);

    /** 贴图第一帧的像素，找不到返回 null */
    Texture texture(String sprite);

    enum Layer { SOLID, CUTOUT, TRANSLUCENT, LIQUID }

    /**
     * 一个面：四个角按游戏烘焙的顺序（逆时针，从外面看）。
     * pos：游戏坐标（Y 朝上、南 = +Z），以格为单位，方块占 0～1；uv：贴图上的位置，以像素为单位按 16 像素宽算（0～16），
     * 游戏为防止图集渗色往中心缩的那一点已经还原（还原后仍有约 1e-3 的浮点误差，出表时取整）。
     * cull：被哪一侧的邻居挡住时不画（游戏方向名 up、down、north、south、west、east），null = 总是画。
     */
    record Quad(float[] pos, float[] uv, String sprite, int tintIndex, boolean shade, String cull) {
    }

    /**
     * parts：第 0 个随机变体按部件分的面（多部件方块一个部件一组，其余一组）。
     * variants：每个随机变体的全部面（只有一个变体时就一项），用来判断「只差贴图朝向」的随机转。
     * tints：面上用到的染色索引 → 染色路（见 {@link TintProbe}）。
     * liquidSprite、liquidTint：液体（游戏用液体渲染器画的）才有，其余为 null。
     * offset：随机偏移（花草），null / XZ / XYZ。renderer：模型类名，核对用。
     */
    record Model(Layer layer, boolean opaqueFull, boolean fullCollision, boolean ambientOcclusion, int lightEmission, String offset,
                 List<List<Quad>> parts, List<List<Quad>> variants, Map<Integer, String> tints,
                 String liquidSprite, String liquidTint, String renderer) {
    }

    /** argb：width × height 个像素，每个 0xAARRGGBB，逐行从上到下 */
    record Texture(int width, int height, int[] argb) {
    }
}
