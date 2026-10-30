package sample;

import java.util.Arrays;
import net.minecraft.client.model.geom.ModelPart;

/** 子类收窄状态类型：javac 在这里另生成桥方法 setupAnim(HumanState)，参数也是渲染状态，翻译器要跳过它 */
public class StateModel extends StateBaseModel<SubState> {
    private final ModelPart[] arms = new ModelPart[2];

    public StateModel(ModelPart root) {
        super(root);
        Arrays.setAll(arms, i -> root.getChild(i == 0 ? "left_arm" : "right_arm"));
    }

    @Override
    public void setupAnim(SubState s) {
        super.setupAnim(s);
        for (ModelPart a : arms) a.zRot = s.flag ? s.ageInTicks * 0.1F : -0.2F;
    }
}
