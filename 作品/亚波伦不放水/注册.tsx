// 本作品所有 Composition 的登记（通用部分在 注册工厂.tsx）：加段不用改这里。
// webpackContext 的参数 webpack 要在打包时读出来，只能就地写字面量；只扫 段/、核对/ 两层，不扫作品根下别的目录。
// 段.ts 开页就求值（登记要尺寸、帧数）；画面、叠层 mode: 'lazy'，渲哪段才求值哪段。
import { makeRegistry } from '@engine/段/注册工厂.tsx';
import { manifest, segDir } from './清单.ts';

export const registration = makeRegistry({
  manifest,
  segDir,
  // 键是目录名（数据，不是属性名）：注册工厂拿段目录的第一层（段、核对）来查
  modules: {
    '段': {
      segDefs: import.meta.webpackContext('./段', { recursive: true, regExp: /^\.\/[^/]+\/段\.ts$/ }),
      pictures: import.meta.webpackContext('./段', { recursive: true, regExp: /^\.\/[^/]+\/(画面\.tsx|叠层[^/]*\.tsx)$/, mode: 'lazy' }),
    },
    '核对': {
      segDefs: import.meta.webpackContext('./核对', { recursive: true, regExp: /^\.\/[^/]+\/段\.ts$/ }),
      pictures: import.meta.webpackContext('./核对', { recursive: true, regExp: /^\.\/[^/]+\/(画面\.tsx|叠层[^/]*\.tsx)$/, mode: 'lazy' }),
    },
  },
});
