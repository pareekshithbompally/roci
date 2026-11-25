// What the process holds in memory now: MLX's own buffers and the whole app's footprint (what iOS judges it by).

import Foundation
import MLX

/// `{"ok":true, "active", "cache", "peak", "footprint", "footprintPeak", "available"?}` in bytes; `peak` is MLX's since the
/// last reading (then reset), `footprintPeak` the app's highest since launch.
@_cdecl("roci_mlx_memory")
public func rociMLXMemory() -> UnsafeMutablePointer<CChar> {
    let mlx = Memory.snapshot()
    let vm = footprint()
    Memory.peakMemory = 0
    var reading: [String: Any] = ["ok": true, "active": mlx.activeMemory, "cache": mlx.cacheMemory, "peak": mlx.peakMemory, "footprint": vm.footprint, "footprintPeak": vm.peak]
    #if os(iOS)
    reading["available"] = os_proc_available_memory()
    #endif
    let data = (try? JSONSerialization.data(withJSONObject: reading)) ?? Data(#"{"ok":false,"error":"unencodable reading"}"#.utf8)
    return strdup(String(decoding: data, as: UTF8.self))
}

/// The process's physical footprint now and its highest since launch (Activity Monitor's Memory column; iOS's per-app limit
/// counts this).
private func footprint() -> (footprint: UInt64, peak: Int64) {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    return result == KERN_SUCCESS ? (info.phys_footprint, info.ledger_phys_footprint_peak) : (0, 0)
}
