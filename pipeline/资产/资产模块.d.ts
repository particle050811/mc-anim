// import x from 'asset:<id>'：png 得到 data URI，json 得到解析后的值（按需断言类型），其余得到打包后的文件地址。见 webpack.ts。
declare module 'asset:*' {
  const value: string;
  export default value;
}
