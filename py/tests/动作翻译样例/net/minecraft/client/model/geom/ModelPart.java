package net.minecraft.client.model.geom;

import java.util.Map;

/** 测试桩：只留动作翻译用到的字段和方法，名字、签名照 1.20.1 官方名 */
public final class ModelPart {
    public float x, y, z, xRot, yRot, zRot;
    public float xScale = 1.0F, yScale = 1.0F, zScale = 1.0F;
    public boolean visible = true;
    private final Map<String, ModelPart> children;

    public ModelPart(Map<String, ModelPart> children) {
        this.children = children;
    }

    public ModelPart getChild(String name) {
        ModelPart p = children.get(name);
        if (p == null) throw new java.util.NoSuchElementException(name);
        return p;
    }

    public void setRotation(float xRot, float yRot, float zRot) {
        this.xRot = xRot;
        this.yRot = yRot;
        this.zRot = zRot;
    }
}
