// 作品 清单.ts 里一段的条目：段键（<章>-<段名>）、章（核对段写 '核对'）、集。pipeline 按这个形状读各作品的清单。
export type 清单条目 = { 键: string; 章: number | '核对'; 集?: number };
