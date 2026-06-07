import Foundation

// MARK: - Timeline (PTS-aligned mix; ported from the proven Rust align.rs)
//
// Lays both streams on a shared 48 kHz sample timeline keyed off the first PTS
// seen, silence-filling gaps, and emits summed mono frames once both lanes cover
// a region. A single lane (sys) is used for one-source (system-only / mic-only)
// capture. In mixed mode each emitted sample has the system echo removed from
// the mic by the NLMS canceller before summing.

final class Timeline {
    private let aec = EchoCanceller()
    private var t0: Double?
    private var consumed = 0
    private var sysBase = 0, sys: [Float] = []
    private var micBase = 0, mic: [Float] = []
    private let mixed: Bool
    private let micStallFallback = Int(3 * PROCESS_RATE) // 3 s

    init(mixed: Bool) { self.mixed = mixed }

    /// `isMic` only matters in mixed mode; single-source data uses the sys lane.
    func push(isMic: Bool, pts: Double, _ samples: [Float]) {
        if t0 == nil { t0 = pts }
        let idx = max(0, Int(((pts - t0!) * PROCESS_RATE).rounded()))
        if mixed && isMic { place(&mic, &micBase, idx, samples) }
        else { place(&sys, &sysBase, idx, samples) }
    }

    private func place(_ buf: inout [Float], _ base: inout Int, _ idx: Int, _ s: [Float]) {
        if buf.isEmpty { base = idx; buf = s; return }
        let end = base + buf.count
        if idx > end { buf.append(contentsOf: repeatElement(0, count: idx - end)) }
        buf.append(contentsOf: s)
    }

    private func at(_ buf: [Float], _ base: Int, _ i: Int) -> Float {
        if i < base { return 0 }
        let k = i - base
        return k < buf.count ? buf[k] : 0
    }

    func drain() -> [Float] {
        let sysEnd = sysBase + sys.count
        let micEnd = micBase + mic.count
        let ready: Int
        if mixed {
            if sysEnd - consumed >= micStallFallback && micEnd < consumed + 1 {
                ready = sysEnd
            } else {
                ready = min(sysEnd, micEnd)
            }
        } else {
            ready = sysEnd
        }
        return emit(upTo: ready, compacting: true)
    }

    func drainRemaining() -> [Float] {
        let ready = mixed ? max(sysBase + sys.count, micBase + mic.count) : sysBase + sys.count
        return emit(upTo: ready, compacting: false)
    }

    private func emit(upTo ready: Int, compacting: Bool) -> [Float] {
        if ready <= consumed { return [] }
        var out = [Float](repeating: 0, count: ready - consumed)
        for i in consumed..<ready {
            let s = at(sys, sysBase, i)
            if mixed {
                let m = at(mic, micBase, i)
                let voice = aec.process(far: s, near: m) // echo removed, mic kept
                out[i - consumed] = 0.5 * s + 0.5 * voice
            } else {
                out[i - consumed] = s
            }
        }
        consumed = ready
        if compacting { compact() }
        return out
    }

    private func compact() {
        if consumed > sysBase {
            let d = min(consumed - sysBase, sys.count)
            if d > 0 { sys.removeFirst(d); sysBase += d }
        }
        if consumed > micBase {
            let d = min(consumed - micBase, mic.count)
            if d > 0 { mic.removeFirst(d); micBase += d }
        }
    }
}
