import Foundation

// MARK: - Echo canceller (NLMS adaptive filter)
//
// Subtracts the system audio's echo from the mic WITHOUT gating it: estimates
// the echo as a filtered copy of the far-end (system) and subtracts it, leaving
// the voice (which is uncorrelated with the system audio) intact. On headphones
// there's no echo, so the filter adapts to ~zero and the mic passes through
// clean. Worst case is some residual echo — never a lost mic.

final class EchoCanceller {
    private let L = 2048              // ~43 ms echo tail @ 48 kHz
    private var w: [Float]            // adaptive filter weights
    private var x: [Float]            // circular far-end (system) history
    private var head = 0
    private var energy: Float = 0     // running ||x||^2
    private let mu: Float = 0.3       // normalized step size
    private let eps: Float = 1e-3

    init() {
        w = [Float](repeating: 0, count: L)
        x = [Float](repeating: 0, count: L)
    }

    /// One sample in, cleaned near-end (voice) out.
    func process(far: Float, near: Float) -> Float {
        head = (head + 1) % L
        energy -= x[head] * x[head]
        x[head] = far
        energy += far * far

        var y: Float = 0
        var idx = head
        var k = 0
        while k < L { y += w[k] * x[idx]; idx -= 1; if idx < 0 { idx = L - 1 }; k += 1 }

        let e = near - y                       // echo removed; voice remains
        let g = mu * e / (energy + eps)
        idx = head; k = 0
        while k < L { w[k] += g * x[idx]; idx -= 1; if idx < 0 { idx = L - 1 }; k += 1 }
        return e
    }
}
