// Where a chat gives way on the GPU: after each prefill chunk and each sampled token, Rust's queue runs more urgent work
// (speech-to-text) and then lets the chat go on. The hook is set once at startup.

import Foundation
import MLX
import MLXLMCommon

/// Returns once this work may go on (at once when nothing more urgent waits).
public typealias RociMLXCheckpoint = @convention(c) () -> Void

final class Checkpoint: @unchecked Sendable {
    static let shared = Checkpoint()
    private let lock = NSLock()
    private var hook: RociMLXCheckpoint?

    func set(_ hook: RociMLXCheckpoint) { lock.withLock { self.hook = hook } }

    func pass() { lock.withLock { hook }?() }

    /// A prompt read in chunks with a checkpoint after each.
    static let prefill = PrefillParameters(progress: { _, _ in Checkpoint.shared.pass() })

    /// A checkpoint after each token the generation loop samples.
    static let components = GenerationComponents(logitProcessorFactory: { EachToken() })
}

/// Changes nothing about sampling: it only marks each sampled token as a checkpoint (composed after the penalties). The
/// library calls `didSample` on every step; `didEmit` only when a thinking budget is set.
private struct EachToken: LogitProcessor {
    mutating func prompt(_ prompt: MLXArray) {}
    func process(logits: MLXArray) -> MLXArray { logits }
    mutating func didSample(token: MLXArray) { Checkpoint.shared.pass() }
}

@_cdecl("roci_mlx_set_checkpoint")
public func rociMLXSetCheckpoint(_ hook: RociMLXCheckpoint) {
    Checkpoint.shared.set(hook)
}
