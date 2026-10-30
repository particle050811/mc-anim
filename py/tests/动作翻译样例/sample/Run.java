package sample;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.model.geom.ModelPart;

/**
 * 在 JVM 上跑 SampleModel，给翻译结果当真值。
 * 第一行打印各部件的初始姿态；之后每读一行输入（limbSwing limbSwingAmount ageInTicks netHeadYaw headPitch partialTick health attackTime 是 float 的位，
 * aggressive mode tick riding young 是整数）就打印一行：每个部件 x y z xRot yRot zRot xScale yScale zScale 的 float 位和 visible。
 */
public final class Run {
    static final String[] PARTS = {"body", "head", "left_arm", "leg0", "leg1", "leg2", "leg3", "right_arm", "tail"};
    static final float[][] REST = {
        {0, 0, 0, 0, 0, 0}, {0, 4, 0, 0.1F, 0, 0}, {5, 2, 0, 0, 0, 0}, {-2, 12, 0, 0, 0, 0}, {2, 12, 0, 0, 0, 0},
        {-2, 12, 4, 0, 0, 0}, {2, 12, 4, 0, 0, 0}, {-5, 2, 0, 0, 0, 0.05F}, {0, 10, 2, 0.3F, 0, 0},
    };

    static float f(String s) {
        return Float.intBitsToFloat(Integer.parseUnsignedInt(s, 16));
    }

    public static void main(String[] args) throws Exception {
        StringBuilder rest = new StringBuilder();
        for (int i = 0; i < PARTS.length; i++) {
            rest.append(i == 0 ? "" : " ").append(PARTS[i]);
            for (float v : REST[i]) rest.append(' ').append(Integer.toHexString(Float.floatToRawIntBits(v)));
        }
        System.out.println(rest);
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] s = line.trim().split("\\s+");
            Map<String, ModelPart> parts = new LinkedHashMap<>();
            Map<String, ModelPart> rootChildren = new HashMap<>();
            Map<String, ModelPart> bodyChildren = new HashMap<>();
            for (int i = 0; i < PARTS.length; i++) {
                ModelPart p = new ModelPart(PARTS[i].equals("body") ? bodyChildren : new HashMap<>());
                p.x = REST[i][0];
                p.y = REST[i][1];
                p.z = REST[i][2];
                p.xRot = REST[i][3];
                p.yRot = REST[i][4];
                p.zRot = REST[i][5];
                parts.put(PARTS[i], p);
                (PARTS[i].equals("tail") ? bodyChildren : rootChildren).put(PARTS[i], p);
            }
            ModelPart root = new ModelPart(rootChildren);
            SampleModel m = new SampleModel(root);
            SampleEntity e = new SampleEntity();
            e.health = f(s[6]);
            e.aggressive = Integer.parseInt(s[8]) != 0;
            e.mode = Mode.values()[Integer.parseInt(s[9])];
            e.tick = Integer.parseInt(s[10]);
            m.attackTime = f(s[7]);
            m.riding = Integer.parseInt(s[11]) != 0;
            m.young = Integer.parseInt(s[12]) != 0;
            m.prepareMobModel(e, f(s[0]), f(s[1]), f(s[5]));
            m.setupAnim(e, f(s[0]), f(s[1]), f(s[2]), f(s[3]), f(s[4]));
            StringBuilder out = new StringBuilder();
            for (String name : PARTS) {
                ModelPart p = parts.get(name);
                for (float v : new float[] {p.x, p.y, p.z, p.xRot, p.yRot, p.zRot, p.xScale, p.yScale, p.zScale})
                    out.append(Integer.toHexString(Float.floatToRawIntBits(v))).append(' ');
                out.append(p.visible ? 1 : 0).append(' ');
            }
            System.out.println(out.toString().trim());
        }
    }
}
