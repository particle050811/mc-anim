package sample;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.model.geom.ModelPart;

/**
 * 在 JVM 上跑 StateModel：每读一行（walk headPitch ageInTicks 是 float 的位，flag 是整数）打印一行，部件和格式同 Run。
 */
public final class StateRun {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] s = line.trim().split("\\s+");
            Map<String, ModelPart> parts = new LinkedHashMap<>();
            Map<String, ModelPart> rootChildren = new HashMap<>();
            Map<String, ModelPart> bodyChildren = new HashMap<>();
            for (int i = 0; i < Run.PARTS.length; i++) {
                ModelPart p = new ModelPart(Run.PARTS[i].equals("body") ? bodyChildren : new HashMap<>());
                p.x = Run.REST[i][0];
                p.y = Run.REST[i][1];
                p.z = Run.REST[i][2];
                p.xRot = Run.REST[i][3];
                p.yRot = Run.REST[i][4];
                p.zRot = Run.REST[i][5];
                parts.put(Run.PARTS[i], p);
                (Run.PARTS[i].equals("tail") ? bodyChildren : rootChildren).put(Run.PARTS[i], p);
            }
            StateModel m = new StateModel(new ModelPart(rootChildren));
            SubState st = new SubState();
            st.walk = Run.f(s[0]);
            st.headPitch = Run.f(s[1]);
            st.ageInTicks = Run.f(s[2]);
            st.flag = Integer.parseInt(s[3]) != 0;
            ((StateBaseModel<SubState>) m).setupAnim(st);
            StringBuilder out = new StringBuilder();
            for (String name : Run.PARTS) {
                ModelPart p = parts.get(name);
                for (float v : new float[] {p.x, p.y, p.z, p.xRot, p.yRot, p.zRot, p.xScale, p.yScale, p.zScale})
                    out.append(Integer.toHexString(Float.floatToRawIntBits(v))).append(' ');
                out.append(p.visible ? 1 : 0).append(' ');
            }
            System.out.println(out.toString().trim());
        }
    }
}
