package sample;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;

/** 循环次数取决于实体（符号条件的循环）：翻译器应报不支持 */
public class LoopModel extends EntityModel<SampleEntity> {
    private final ModelPart head;

    public LoopModel(ModelPart root) {
        this.head = root.getChild("head");
    }

    @Override
    public void setupAnim(SampleEntity e, float ls, float la, float age, float yaw, float pitch) {
        for (int i = 0; i < e.tick; i++) head.xRot += 0.1F;
    }
}
