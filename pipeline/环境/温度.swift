import Foundation
import IOKit

// IOHID 的温度接口不是公开 Swift API；符号或传感器不可用时由调用方记 null，不影响渲染。
@_silgen_name("IOHIDEventSystemClientCreate") func 建(_ a: CFAllocator?) -> Unmanaged<CFTypeRef>?
@_silgen_name("IOHIDEventSystemClientSetMatching") func 配(_ c: CFTypeRef, _ m: CFDictionary)
@_silgen_name("IOHIDEventSystemClientCopyServices") func 列(_ c: CFTypeRef) -> Unmanaged<CFArray>?
@_silgen_name("IOHIDServiceClientCopyProperty") func 属性(_ s: CFTypeRef, _ k: CFString) -> Unmanaged<CFTypeRef>?
@_silgen_name("IOHIDServiceClientCopyEvent") func 事件(_ s: CFTypeRef, _ t: Int64, _ o: Int32, _ ts: Int64) -> Unmanaged<CFTypeRef>?
@_silgen_name("IOHIDEventGetFloatValue") func 值(_ e: CFTypeRef, _ f: Int32) -> Double

guard let c = 建(kCFAllocatorDefault)?.takeRetainedValue() else { print("null"); exit(0) }
配(c, ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 5] as CFDictionary)
let 服务 = 列(c)?.takeRetainedValue() as? [CFTypeRef] ?? []
var 最高: Double? = nil
for s in 服务 {
    let 名 = 属性(s, "Product" as CFString)?.takeRetainedValue() as? String ?? ""
    // tcal 是校准值，不能拿来当芯片温度；这里只取已核对的两组 die 传感器。
    guard 名.hasPrefix("PMU tdie") || 名.hasPrefix("PMU2 tdie"),
          let e = 事件(s, 15, 0, 0)?.takeRetainedValue() else { continue }
    let 温度 = 值(e, 15 << 16)
    if 温度.isFinite && 温度 > 0 && 温度 < 150 { 最高 = max(最高 ?? 温度, 温度) }
}
print(最高.map { String($0) } ?? "null")
