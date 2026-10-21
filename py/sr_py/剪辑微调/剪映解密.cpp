// 剪映专业版（Mac）草稿解密：用本机剪映自己的 libvideoeditor.dylib 读草稿文件，写出明文 JSON。
// 剪映 6.0 起保存草稿时把 draft_info.json、draft_meta_info.json 存成密文（Mac 11.4.2 实测也是），读回用户的调整只能这样解。
// 做法同 Windows 上的 jy-draftc（调 videoeditor.dll）：构造库里的 draft_store::DraftIOFactoryBase，createIO(无密钥, 路径) 得到 DraftIO，
// 调它的读（虚表第 5 项，返回 {路径, 16 字节, 内容, 加密类型}），明文、密文都能读。剪映升级后符号或虚表变了就要跟着改。
// 编译（剪映.py 第一次用时自动编到 out/）：clang++ -std=c++17 -O1 -arch arm64 剪映解密.cpp -o out/剪映解密 -Wl,-rpath,<剪映>/Contents/Frameworks
// 用法：剪映解密 <草稿文件> <输出明文文件>    库加载时往 stdout 打几行日志，所以内容写文件不走 stdout。
#include <dlfcn.h>
#include <array>
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>

struct 读结果 { std::string 路径; char 中间[16]; std::string 内容; int 加密类型; };
typedef std::shared_ptr<void> (*CreateIO)(void*, const std::array<char, 32>*, const std::string&);
typedef void (*Ctor)(void*);
typedef 读结果 (*ReadFn)(void*);

int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "用法：剪映解密 <草稿文件> <输出文件> [剪映.app]\n"); return 1; }
  std::string app = argc > 3 ? argv[3] : "/Applications/VideoFusion-macOS.app";
  void* h = dlopen((app + "/Contents/Frameworks/libvideoeditor.dylib").c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!h) { fprintf(stderr, "加载剪映的库失败：%s\n", dlerror()); return 2; }
  Ctor ctor = (Ctor)dlsym(h, "_ZN11draft_store18DraftIOFactoryBaseC1Ev");
  CreateIO cio = (CreateIO)dlsym(h, "_ZN11draft_store18DraftIOFactoryBase8createIOEPKNSt3__15arrayIcLm32EEERKNS1_12basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE");
  if (!ctor || !cio) { fprintf(stderr, "剪映的库里找不到 DraftIOFactoryBase（剪映升级改了？）\n"); return 3; }
  alignas(16) static char 工厂[0x100];
  memset(工厂, 0, sizeof 工厂);
  ctor(工厂);
  std::shared_ptr<void> io = cio(工厂, nullptr, std::string(argv[1]));
  if (!io) { fprintf(stderr, "createIO 返回空\n"); return 4; }
  void* obj = io.get();
  void** vt = *(void***)obj;
  读结果 r = ((ReadFn)vt[5])(obj);
  if (r.内容.empty() || (r.内容[0] != '{' && r.内容[0] != '[')) { fprintf(stderr, "解出来不是 JSON（加密类型 %d，长 %zu）\n", r.加密类型, r.内容.size()); return 5; }
  FILE* f = fopen(argv[2], "wb");
  if (!f) { perror("写输出"); return 6; }
  fwrite(r.内容.data(), 1, r.内容.size(), f);
  fclose(f);
  fprintf(stderr, "加密类型 %d，明文 %zu 字节\n", r.加密类型, r.内容.size());
  return 0;
}
