// 书与笔、成书（第七章 7-4-3 刘心忠写报告、7-4-4 乔雷夫读报告）。
// 原版书没有摊开放桌上的样子（手里是物品图，写、读是界面 `BookEditScreen`、`BookViewScreen`），而脚本要「书页上能看到字」「手指停在那行」，所以把书界面搬进三维：
// 摊开的书 = 左右两页，每页是书界面那张纸（textures/gui/book.png 左上 192×192 里的纸，带棕色书皮边），字照 `BookViewScreen` 排法，像素字用原版字体（模型/界面/像素字.ts）。
// 贴图 npm run 取材 -- 书贴图（书界面、书与笔、成书、羽毛，1.20.1 客户端 jar 原样）。
// 原版排法（`BookViewScreen.render`）：纸画在 (x, 2)、192×192；页码「第 n 页，共 m 页」右对齐到 x + 148、y 18；正文从 (x + 36, 32) 起，每行 9 像素，最多 14 行、114 像素宽；字是黑色、不带阴影。
// 纸的不透明范围是 book.png 的 (20, 1)～(166, 181)，这里只取这一块（146×180），所以正文起点在这块里是 (16, 31)，页码右沿 128、y 17。
//
// 三维的书（单位格，书的本地坐标）：书脊沿 +Y（离读书的人远的那头是 +Y，字头朝 +Y），左页在 x < 0、右页在 x > 0，纸面朝 +Z；原点在书脊底下、桌面上（书皮底面 z = 0）。
// 每页 `pageWidth` × `pageHeight`，纸下面垫一层书页的厚度和一层书皮。两页各往上翘 `tiltDeg`（摊开的书中间低、两边高）。
// `合`（0～1）：左半本绕书脊翻过来盖到右半本上（写完合上）：转轴在右半本纸面的高度，合上以后两层纸叠在一起，和 `ClosedBook` 严丝合缝。`crumple`（0～1）：右页被手攥起来揉皱（7-4-4 捏皱报告，见下面 `皱页`）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { DISPLAY, ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png, type Png } from '../../engine/model/贴图.ts';
import { drawText, textWidth, lineHeight } from '../界面/像素字.ts';
import bookGuiPng from 'asset:贴图/物品/书/书界面';
import featherPng from 'asset:贴图/物品/书/羽毛';
import writableBookPng from 'asset:贴图/物品/书/书与笔';
import writtenBookPng from 'asset:贴图/物品/书/成书';

const bookGuiTex = png(bookGuiPng);
export const featherTex = png(featherPng);
export const writableBookTex = png(writableBookPng);
export const writtenBookTex = png(writtenBookPng);

const paperRect = { x: 20, y: 1, w: 146, h: 180 };
const textArea = { x: 16, y: 31, 宽: 114, maxLines: 14 };
const pageNumAnchor = { x: 128, y: 17 };
// 一个界面像素在三维里多大（格）：一页 0.365 × 0.45 格，两页摊开 0.73 格宽，和上身差不多（原版讲台上的书约 0.75 格）
export const guiPixel = 0.0025;
export const pageWidth = paperRect.w * guiPixel;
export const pageHeight = paperRect.h * guiPixel;
const paperThick = 0.03;
const coverThick = 0.008;
// 合上的书（`ClosedBook`）占的长方体（书的本地坐标）：编排里算手拿书、碰桌面用
export const closedBookBox = {
  min: [-coverThick, -(pageHeight + 0.012) / 2, 0],
  max: [pageWidth + 0.008, (pageHeight + 0.012) / 2, 2 * paperThick + 2 * coverThick],
};
const tiltDeg = 6;

// 一页纸的贴图：纸 + 正文前 字数 个字 + 页码。画在 2D 画布上（4 倍），最近邻采样
const canvasScale = 4;
const paperCanvas = (() => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = paperRect.w;
  canvas.height = paperRect.h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(paperRect.w, paperRect.h);
  for (let y = 0; y < paperRect.h; y++)
    for (let x = 0; x < paperRect.w; x++) {
      const srcIdx = ((y + paperRect.y) * bookGuiTex.w + (x + paperRect.x)) * 4;
      const dstIdx = (y * paperRect.w + x) * 4;
      for (let k = 0; k < 4; k++) img.data[dstIdx + k] = bookGuiTex.px[srcIdx + k];
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
})();

export type BookPage = { lines: string[]; pageNo: number; pageTotal: number; pageNumFormat: string };
// 第 n 个字写在哪（界面像素，这一页纸框里）：给 7-4-3 的羽毛笔尖跟着字走、7-4-4 的手停在那一行
export const charPos = (page: BookPage, charIndex: number): [number, number] => {
  let remaining = charIndex;
  for (let i = 0; i < page.lines.length; i++) {
    const lineChars = [...page.lines[i]];
    if (remaining <= lineChars.length) return [textArea.x + textWidth(lineChars.slice(0, remaining).join('')), textArea.y + i * lineHeight];
    remaining -= lineChars.length;
  }
  return [textArea.x, textArea.y + page.lines.length * lineHeight];
};
export const pageCharCount = (page: BookPage) => page.lines.reduce((a, l) => a + [...l].length, 0);
// 某一行在纸面上的高度范围（界面像素，从纸框顶往下）
export const lineY = (lineIndex: number) => textArea.y + lineIndex * lineHeight;

const drawPage = (page: BookPage, charCount: number): THREE.CanvasTexture | null => {
  if (!paperCanvas) return null;
  const canvas = document.createElement('canvas');
  canvas.width = paperRect.w * canvasScale;
  canvas.height = paperRect.h * canvasScale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(paperCanvas, 0, 0, canvas.width, canvas.height);
  const pageLabel = page.pageNumFormat.replace('%1$s', String(page.pageNo)).replace('%2$s', String(page.pageTotal));
  drawText(ctx, pageLabel, pageNumAnchor.x - textWidth(pageLabel), pageNumAnchor.y, '#000000', canvasScale);
  let left = charCount;
  page.lines.forEach((line, i) => {
    if (left <= 0) return;
    const chars = [...line].slice(0, left);
    left -= [...line].length;
    drawText(ctx, chars.join(''), textArea.x, textArea.y + i * lineHeight, '#000000', canvasScale);
  });
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

// 揉皱：把一页纸面的网格往攥住的那一点收拢，再拱起、起褶。k 0～1；握点是纸面上的点（页本地坐标，x 0～页宽 从书脊往外，y 0～页高 从下往上）。
// 原版的书页不会皱，这是给 Seedance 看「手攥紧、纸被捏皱」这个动作的示意（7-4-4 脚本），成片里画成真的纸被攥皱
const crumpleOffset = (x: number, y: number, k: number, gripPt: [number, number]): [number, number, number] => {
  if (k <= 0) return [x, y, 0];
  const dx = gripPt[0] - x;
  const dy = gripPt[1] - y;
  const dist = Math.hypot(dx, dy);
  const nearness = Math.exp(-dist / 0.18); // 离握点越近收得越多
  const pull = k * (0.25 + 0.55 * nearness);
  const hash2 = (seedA: number, seedB: number) => {
    const raw = Math.sin(seedA * 127.1 + seedB * 311.7) * 43758.5453;
    return raw - Math.floor(raw);
  };
  // 褶子：几道随机方向的正弦叠起来，振幅随 k 长
  const wrinkle = (Math.sin(x * 61 + y * 23) * 0.5 + Math.sin(x * 19 - y * 71 + 1.3) * 0.35 + (hash2(Math.round(x * 40), Math.round(y * 40)) - 0.5) * 0.4) * 0.025 * k;
  return [x + dx * pull, y + dy * pull, Math.max(0, wrinkle + k * 0.06 * nearness * (1 + Math.sin(dist * 30)))];
};

const pageGeometry = (crumple: number, gripPt: [number, number], segments = 28) => {
  const geo = new THREE.PlaneGeometry(pageWidth, pageHeight, segments, segments);
  geo.translate(pageWidth / 2, pageHeight / 2, 0);
  if (crumple > 0) {
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const [x, y, z] = crumpleOffset(positions.getX(i), positions.getY(i), crumple, gripPt);
      positions.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
  }
  return geo;
};

const coverColor = '#5b2a12';
const paperEdgeColor = '#efe3c0';

// 半本：纸面（贴图）+ 书页厚度 + 书皮，x 从书脊往外 0～页宽（左半本镜像）
const HalfBook: React.FC<{ tex: THREE.Texture | null; crumple?: number; gripPt?: [number, number] }> = ({ tex, crumple = 0, gripPt = [0, 0] }) => {
  const geo = useMemo(() => pageGeometry(crumple, gripPt), [crumple, gripPt[0], gripPt[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <mesh geometry={geo} position={[0, -pageHeight / 2, paperThick + 0.0005]} castShadow receiveShadow>
        <meshStandardMaterial map={tex ?? undefined} color={tex ? '#ffffff' : paperEdgeColor} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[pageWidth / 2, 0, paperThick / 2]} castShadow receiveShadow>
        <boxGeometry args={[pageWidth * 0.98, pageHeight * 0.97, paperThick]} />
        <meshStandardMaterial color={paperEdgeColor} roughness={0.95} />
      </mesh>
      <mesh position={[pageWidth / 2 + 0.004, 0, -coverThick / 2]} castShadow receiveShadow>
        <boxGeometry args={[pageWidth + 0.008, pageHeight + 0.012, coverThick]} />
        <meshStandardMaterial color={coverColor} roughness={0.8} />
      </mesh>
    </group>
  );
};

// 摊开的书。页们：左页、右页；字数们：两页各写到第几个字（不给就写满）；合 0～1；皱 0～1（右页）；握：右页上攥住的点（界面像素，纸框里，x 从左往右、y 从上往下）
export const OpenBook: React.FC<{ pages: [BookPage, BookPage]; charCounts?: [number, number]; closed?: number; crumple?: number; gripPt?: [number, number] }> = ({
  pages,
  charCounts,
  closed: closed = 0,
  crumple = 0,
  gripPt = [70, 90],
}) => {
  const n0 = charCounts ? charCounts[0] : 999;
  const n1 = charCounts ? charCounts[1] : 999;
  const t0 = useMemo(() => drawPage(pages[0], n0), [pages, n0]);
  const t1 = useMemo(() => drawPage(pages[1], n1), [pages, n1]);
  // 握点换成右页本地坐标（x 从书脊往外、y 从下往上）
  const gripLocal: [number, number] = [gripPt[0] * guiPixel, pageHeight - gripPt[1] * guiPixel];
  const tilt = rad(tiltDeg) * (1 - closed);
  return (
    <group position={[0, 0, coverThick]}>
      {/* 右半本：贴图的左边沿在书脊上 */}
      <group rotation={[0, -tilt, 0]}>
        <HalfBook tex={t1} crumple={crumple} gripPt={gripLocal} />
      </group>
      {/* 左半本：镜像过去（贴图要正着看，所以是绕书脊转 180° 再翻面，不是缩放 −1）。合上时绕书脊（纸面高度）从左边翻到右边 */}
      <group position={[0, 0, paperThick]} rotation={[0, Math.PI * closed, 0]}>
        <group position={[0, 0, -paperThick]} rotation={[0, tilt, 0]}>
          <group scale={[-1, 1, 1]}>
            <HalfBook tex={null} />
          </group>
          <mesh position={[-pageWidth / 2, 0, paperThick + 0.0006]}>
            <planeGeometry args={[pageWidth, pageHeight]} />
            <meshStandardMaterial map={t0 ?? undefined} roughness={0.9} side={THREE.FrontSide} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// 合上的书（成书拿在手上、递出去）：两层书皮夹着纸，书脊在 -X 边；外形 `closedBookBox`，和 `OpenBook` 合 1 时一样
export const ClosedBook: React.FC = () => (
  <group position={[0, 0, coverThick]}>
    <mesh position={[pageWidth / 2, 0, paperThick]} castShadow>
      <boxGeometry args={[pageWidth * 0.98, pageHeight * 0.97, paperThick * 2]} />
      <meshStandardMaterial color={paperEdgeColor} roughness={0.95} />
    </mesh>
    {[-coverThick / 2, paperThick * 2 + coverThick / 2].map((z, i) => (
      <mesh key={i} position={[pageWidth / 2 + 0.004, 0, z]} castShadow>
        <boxGeometry args={[pageWidth + 0.008, pageHeight + 0.012, coverThick]} />
        <meshStandardMaterial color={coverColor} roughness={0.8} />
      </mesh>
    ))}
    <mesh position={[0, 0, paperThick]} castShadow>
      <boxGeometry args={[coverThick * 2, pageHeight + 0.012, paperThick * 2 + coverThick * 2]} />
      <meshStandardMaterial color={coverColor} roughness={0.8} />
    </mesh>
  </group>
);

// 拿在手上的物品图（羽毛笔、书与笔、成书）：挂在 骨架.tsx 的手插槽里，照原版第三人称右手拿 item/generated 物品（同 铁链.tsx 的推导）
const handDisplay = DISPLAY.generated.thirdperson_righthand;
const handToItem = (left: boolean) => {
  const mirror = left ? -1 : 1;
  const [rx, ry, rz] = handDisplay.rotation;
  return new THREE.Matrix4()
    .makeTranslation(0, 0, 9)
    .multiply(new THREE.Matrix4().makeTranslation(mirror, 2, -10))
    .multiply(new THREE.Matrix4().makeScale(16, 16, 16))
    .multiply(new THREE.Matrix4().makeTranslation((mirror * handDisplay.translation[0]) / 16, handDisplay.translation[1] / 16, handDisplay.translation[2] / 16))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(rx), rad(mirror * ry), rad(mirror * rz), 'XYZ')))
    .multiply(new THREE.Matrix4().makeScale(handDisplay.scale[0], handDisplay.scale[1], handDisplay.scale[2]));
};
const rightHandMat = handToItem(false);
const leftHandMat = handToItem(true);
export const HeldItemSprite: React.FC<{ tex: Png; left?: boolean }> = ({ tex, left = false }) => (
  <group matrix={left ? leftHandMat : rightHandMat} matrixAutoUpdate={false}>
    <ItemSprite layers={[{ tex }]} />
  </group>
);
