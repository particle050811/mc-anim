// 本作品所有 Composition 的登记（通用部分在 注册工厂.tsx）：加段不用改这里。
// webpackContext 的参数 webpack 要在打包时读出来，只能就地写字面量；只扫 段/、核对/ 两层，不扫作品根下别的目录。
import { makeRegistry } from '@engine/段/注册工厂.tsx';
import { manifest, segDir } from './清单.ts';

export const registration = makeRegistry({
  manifest,
  segDir,
  modules: {
    段: import.meta.webpackContext('./段', { recursive: true, regExp: /^\.\/[^/]+\/(段\.ts|画面\.tsx|叠层[^/]*\.tsx)$/ }),
    核对: import.meta.webpackContext('./核对', { recursive: true, regExp: /^\.\/[^/]+\/(段\.ts|画面\.tsx|叠层[^/]*\.tsx)$/ }),
  },
});
