package sample;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;

/** 1.21.2 起的写法：setupAnim 收渲染状态（泛型，擦除成 HumanState）；构造里用集合存部件 */
public class StateBaseModel<S extends HumanState> {
    protected final ModelPart head;
    private final List<ModelPart> legs;

    public StateBaseModel(ModelPart root) {
        this.head = root.getChild("head");
        this.legs = new ArrayList<>(Arrays.asList(root.getChild("leg0"), root.getChild("leg1")));
        this.legs.add(root.getChild("leg2"));
    }

    public void setupAnim(S s) {
        head.xRot = s.headPitch * 0.017453292F;
        for (int i = 0; i < legs.size(); i++) legs.get(i).xRot = Mth.cos(s.walk * 0.6662F + i * (float) Math.PI) * 1.4F;
    }
}
