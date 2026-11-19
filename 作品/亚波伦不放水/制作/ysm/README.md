# YSM 可编辑源包：模型与动作往返（不渲染）

**首选：正片模型＋结算舞一键往返。** 每次重新加载本检出的 `GirlYaBoLunCreature.getModel()`，即角色实际绑定的 `productionGeometry` / `productionSkin`，从运行时枚举骨、方盒、任意面与皮肤，不按旧骨数、头发骨名、图集尺寸或待合入方案分支。只读当前未提交代码和资产，不改角色、不发布资产锁。

```sh
maker='作品/亚波伦不放水/制作/ysm'; out="$(mktemp -d)"
python3 -B "$maker/正片出包.py" "$out/D"
python3 -B "$maker/源包.py" import "$out/D/pack" "$out/重导" --slot extra --clip mc_anim_settlement
```

第一条制作命令已含：生成 `pack/`、按运行时枚举的皮肤、轮盘项、重导 `imported/`、逐帧姿势对照、逐像素验贴图、真实求解器回灌 `舞修订.json`，最后才写 zip；第二条是外部编辑器改包后单独重导的最短命令。默认读取相邻 `mc-anim-data` 的已知 zip，或设置 `ANIM_DATA`、传 `--source /已解压的原始包`。回灌用正片实际骨名；旧 Blender 工具的 `--check` 若仍按原包骨表验，不可用它判定新增骨无效。

**严格模式不丢面。** 只要任一骨（包括袍子、新发片）含非标准骨面，就只写 `拓扑报告.json`（含完整原面/法线/UV、骨名、原盒数）和 `非标准面.svg`（逐骨正面/侧面线框，不是渲染），以非零退出，不留假成功的 zip。原生零厚方盒仍是方盒，不报成 quad。已审过报告且想试可见的混合版，可另跑 `python3 -B "$maker/正片出包.py" "$out/混合" --fallback-source`：**仅**有同名原骨的 quad 骨换用该骨原包方盒，保留正片骨链和其余正片方盒。原骨本就没有盒时，该骨不显示几何；若是全新 quad 骨，或不识别的其他几何，仍拒绝。混合 zip 名含「已用原骨替代」；不宣称全 D 版。报告在包外，不把私有面字段塞进 YSM 几何。

派生资源在 `pack/mc_anim_player/`。原主模型、原皮肤、原动作文件、按钮和陌生资源仍在，除清单外原文件逐字节保留。新清单指向正片主模型与图集，将正片默认皮肤设为默认项；每套变体都是同一正片几何上的 `productionSkin`。第一人称手若共用扩展图集，复制其模型并按原贴图区在左上方的扩图比例改声明尺寸，不改 UV；不支持 PBR 辅图、不猜重排图集。运行时的 React 挂件、外置描边 mesh、材质光照和挂杖不属于 `productionGeometry`，不宣称已导出。允许新增原生骨、不许悄悄删原骨导致保留动作悬空。

可另跑 `node --test "$maker/拓扑.test.mjs"`，专测增加原生发骨、含 quad 的袍子和无原骨的拒绝。下列两个低层入口仍可独立使用：通用「改方盒／原动作」与只移植背肢的窄模式。

## 先跑一遍真实资产

在有当前工作区未提交制作代码的仓库根目录执行。Python 3.11+（仅标准库）；舞蹈适配器需要项目的 Node 24+、已装依赖、作品资产锁及对应的 `mc-anim-data`。仅有干净 HEAD、不含 `结算舞姿势.ts` / `Blender舞轨.ts` / D 版资产的检出不能重建这段舞；纯 Python 的通用往返不依赖它们。以下所有产物都写到新目录。

```sh
maker='作品/亚波伦不放水/制作/ysm'
export ANIM_DATA="${ANIM_DATA:-$(cd ../mc-anim-data && pwd)}"
zipfile="$ANIM_DATA/game/缓存/ysm包/使徒娘化版ysm.zip"
out="$(mktemp -d)"; echo "$out"
mkdir "$out/source"; unzip -q "$zipfile" -d "$out/source"
python3 -B "$maker/源包.py" import "$out/source" "$out/base"
node "$maker/结算舞.mjs" bake "$out/base" "$out/edit" back-cubes
python3 -B "$maker/源包.py" export "$out/source" "$out/edit" "$out/pack"
python3 -B "$maker/源包.py" import "$out/pack" "$out/back" --slot extra --clip mc_anim_settlement
node "$maker/结算舞.mjs" verify "$out/base" "$out/back" "$out/pack"
node "$maker/结算舞.mjs" revision "$out/back" "$out/舞修订.json"
node "${maker%/ysm}/导出结算舞.mjs" --check "$out/舞修订.json"
(cd "$out/pack" && zip -q -r "$out/可编辑源包.zip" .)
```

`pack/ysm.json` 是源包入口；`back/model.json` 是可以直接给 `boneGeometry` / `skeletonMatrix` 的项目几何。修订文件可交给既有 Blender 舞轨入口；`revision` 已在内存中把它作为 `settlementRig(sec, edits)` 的输入逐帧回放。这里不运行覆盖正片的 `--import`。在外部编辑器改包后，从 `import "$out/pack"` 那步起用**新**目标目录重导；`verify` 是和未改的项目基准逐帧比，手工改键后出现差异是正常结果。

实际验收用 `sourcing/extract.toml` 所记的作者 4911、B 站 `BV1GSoUBYEK7` 的《使徒娘化版》可编辑源包；`ysm.json` 标注 GPL v3。原 zip SHA-256：`3799cdae87f6bf52ab949ef2f843ce79b82c7779e9b2fe7a4f29668d5c7b201f`。补丁不内嵌第三方资产。对这份输入：

| 检查项 | 本次实测结果 |
| --- | --- |
| 空往返、真实 `main/jump` | 全包无改动时文件内容相同；改 `bone41` 方盒宽度和 `LeftForeArm` 第 2 个旋转键后重导，两处均对上，且只改主模型与主动作用文件 |
| 项目几何 | 原图集 512×512 和五套皮肤不动。两支背肢共 17 根骨记录有差异；左右各取一盒，重建顶点与项目 D 版相同，与原包不同 |
| 项目姿势 | `settlementRig` 的底层动画 + `bonePose` 分层合成（含已生效的舞轨修订、裙摆避让等）；846 帧 @ 60 fps，358 骨，48 骨随时间变化。358 骨的局部旋转、位移、缩放逐轴对比：包内文件经项目播放器播放、重导轨播放，最大误差均为 0 |
| 修订回灌 | 回灌角色求解器再采样，最大轴误差约 `4.44e-16`。不是只检查文件存在或键数 |
| 包保全 | 共 35 个文件，仅 `models/main.json`、`animations/extra.animation.json`、`ysm.json` 有变化。原 extra0～7 不动，另加 `mc_anim_settlement` 和轮盘项「结算舞」；原按钮/控制器/多皮肤/载具/手臂均保留 |

## 自己改方盒和动作

```sh
python3 -B "$maker/源包.py" import "$out/source" "$out/jump" --slot main --clip jump
# 用编辑器改 jump/model.json 与 jump/motion.json，再导出、重读
python3 -B "$maker/源包.py" export "$out/source" "$out/jump" "$out/jump-pack"
python3 -B "$maker/源包.py" import "$out/jump-pack" "$out/jump-back" --slot main --clip jump
node "$maker/播放验证.mjs" "$out/jump-pack" "$out/jump-back"
YSM_4911_SOURCE="$out/source" python3 -B -m unittest discover -v -s "$maker"
```

- `basis.json` 绑定整个原包（含未选资源与空目录）的内容指纹、所选动作和只读骨列表。请保留原包。源包变化要重新导入，不会用旧工程覆盖新包。一次一个 clip，需要处理第二个时以上一次导出的包为新源。
- `model.json` = `{texW,texH,bones}`，使用项目原生 `BedrockBone` / `BedrockCube`。可改已有骨的 pivot、rotation、mirror，可改/增/清空其方盒；支持 box UV、逐面有符号 UV、方盒旋转、inflate、mirror。不换图集，不重命名/增删/重排骨架或换父级。通用工具不猜别的模型的骨名，也不转世界坐标。
- `项目动作.ts` 的 `bindMotion(motion, new Set(model.bones.map(bone => bone.name)))` 返回 `poseAt(sec)`，可直接给项目的骨架/实体。遵从引擎 `sampleAnim` 的循环/停止语义。`播放验证.mjs` 用旧包真实动作键时刻、键间中点及跨周期时刻对照，可检验非结算舞素材，无须加载正片或渲染。
- `motion.json` 的 `track.bones[骨名].rot / pos / scale` 是 `[秒,x,y,z]` 有序键；度、像素、逐轴倍率，均为父骨局部空间。旋转是相对于静止骨角的动画量，不是世界欧拉角，也不再翻 X。数值常量展开成一个 0 秒键，允许负/零缩放；时间精度不强制卡帧。`lengthSec` 和 `loop` 对应播放元数据。已有 clip 可改键和通道；不移动/重命名。不选 clip 时不转换任何旧动作；可另加 `motion.json`，形如 `{"slot":"extra","name":"wave","label":"挥手","track":{"lengthSec":1,"bones":{"Head":{"rot":[[0,0,0,0],[0.5,0,20,0],[1,0,0,0]]}}}}`。动作名/轮盘键冲突则拒绝。
- 未选的文件照原字节复制。对选中的三个 JSON 用源文本作底，仅改指定成员，不把陌生控制器、Molang、扩展字段重新序列化。选中不懂的 clip（如 timeline、表达式、pre/post、样条/缓动）直接报错；不选仍保留。带未知几何字段的骨在制作视图只列骨架，整骨只读，原包内容保留；这不是该几何已在项目中还原。非严格 JSON、重复键、断链、指纹漂移或不支持的格式拒绝。一次失败不会产出半个包。

## 几何、采样与客户端边界

- `back-cubes` 是**明确选择的混合模型**：在原包上只接 `c1`、`c2` 两棵子树的项目 pivot、静止旋转和方盒形状，保留逐盒原 UV。D 版扩图集上的配色、头脸、帽子和项目挂载都不在这个模式。整模用上面的 `正片出包.py`，每次按实际拓扑判断。同一份旧快照曾检出 `Head` 54、`front_h1` 170、`corner_h1` 102、`Face` 8 个 quad；不是对下次角色的预设。通用导出也拒绝往方盒骨上添加 `quads`。
- 动画烘的是项目的 0～845 帧全骨姿势，不是把 `idle` 或原包的表情改个名字。全骨显式写出单位/零通道，只合并完全相同的连续值并保留平台结束键；动画长 14.1 秒，末帧到结尾保持。输出线性数值轨，不承诺帧间连续曲线、游戏时钟、客户端叠层、头部随视角、世界位移、相机或挂载表现等价。原动画引用了模型里不存在的 `Ribbon`，烘焙时明确报告，不造骨、不改原动画；新的不明骨引用会失败。`revision` 专供上述整舞（完整骨架/通道、非循环、固定舞长），不把任意片段当全身覆盖。
- 官方格式和本工具范围不同：本工具只接 Java 版 YSM **可编辑目录**、`spec: 2`、`files.player.model.main` 的单一 `1.12.0` 几何、所选 `main/extra` 的 `1.8.0` 动画；已存在的对应文件必须由清单指向。不读加密 `.ysm`；zip 仅作为可信源目录的打包形式。不是原版基岩资源包、网易中国版组件、女仆模组包或 `.bbmodel` 转换器。
- **未实机、未渲染**。上述结果是 mc-anim 数值与文件验收，不是 Blockbench 视图或游戏内效果验收。如要实机验收，单独复制新包到匹配版本的 Java YSM 测试实例 `config/yes_steve_model/custom/`，重载，检查「结算舞」轮盘项、背肢轮廓及原轮盘/皮肤。未向任何客户端安装。

官方依据：[模型格式说明](https://ysm.cfpa.team/wiki/type/)、[项目结构与各版清单](https://ysm.cfpa.team/wiki/struct/)、[轮盘动作命名与播放](https://ysm.cfpa.team/wiki/animation/extra/)、[自定义轮盘](https://ysm.cfpa.team/wiki/roulette/)、[特殊骨组](https://ysm.cfpa.team/wiki/tph2yetr/)、[中国版组件转换（另一目标）](https://ysm.cfpa.team/wiki/trans/netease/)。
