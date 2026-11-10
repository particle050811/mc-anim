package mcai.record;

import com.mojang.blaze3d.vertex.VertexConsumer;

import java.util.ArrayList;
import java.util.List;

/** 录制时替粒子的 render() 接顶点：每个顶点 x, y, z（相对镜头）、u, v（图集）、r, g, b, a（0～1）。不往显卡送任何东西。 */
final class VertexCapture implements VertexConsumer {
    final List<float[]> verts = new ArrayList<>();
    private float[] cur = new float[9];
    private boolean hasDefault;
    private final float[] def = new float[4];

    void clear() {
        verts.clear();
        cur = new float[9];
    }

    public VertexConsumer vertex(double x, double y, double z) {
        cur[0] = (float) x;
        cur[1] = (float) y;
        cur[2] = (float) z;
        return this;
    }

    public VertexConsumer color(int r, int g, int b, int a) {
        cur[5] = r / 255f;
        cur[6] = g / 255f;
        cur[7] = b / 255f;
        cur[8] = a / 255f;
        return this;
    }

    public VertexConsumer uv(float u, float v) {
        cur[3] = u;
        cur[4] = v;
        return this;
    }

    public VertexConsumer overlayCoords(int u, int v) {
        return this;
    }

    public VertexConsumer uv2(int u, int v) {
        return this;
    }

    public VertexConsumer normal(float x, float y, float z) {
        return this;
    }

    public void endVertex() {
        if (hasDefault) System.arraycopy(def, 0, cur, 5, 4);
        verts.add(cur);
        cur = new float[9];
    }

    public void defaultColor(int r, int g, int b, int a) {
        hasDefault = true;
        def[0] = r / 255f;
        def[1] = g / 255f;
        def[2] = b / 255f;
        def[3] = a / 255f;
    }

    public void unsetDefaultColor() {
        hasDefault = false;
    }
}
