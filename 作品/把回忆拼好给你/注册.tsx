// 本作品所有 Composition 的登记（通用部分在 注册工厂.tsx）：加段不用改这里。
// webpackContext 的参数 webpack 要在打包时读出来，只能就地写字面量；只扫 段/、核对/ 两层，不扫作品根下别的目录。
import { 做注册 } from '@engine/段/注册工厂.tsx';
import { 清单, 段目录 } from './清单.ts';

export const 注册 = 做注册({
  清单,
  段目录,
  模块: {
    段: import.meta.webpackContext('./段', { recursive: true, regExp: /^\.\/[^/]+\/(段\.ts|画面\.tsx|叠层[^/]*\.tsx)$/ }),
    核对: import.meta.webpackContext('./核对', { recursive: true, regExp: /^\.\/[^/]+\/(段\.ts|画面\.tsx|叠层[^/]*\.tsx)$/ }),
  },
});
