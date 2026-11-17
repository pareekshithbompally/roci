// Read aloud on MLX: one voice model loaded at a time; a sentence in, mono samples out.

import Foundation
import MLX
import MLXAudioTTS

struct SpeakRequest: Decodable, Sendable {
    let modelDir: String
    let text: String
    /// The model's speaker name; nil for its default voice.
    let voice: String?
}

/// The loaded voice model (MLX models are reference types used from one actor).
final class Speaker: @unchecked Sendable {
    let dir: String
    let model: any SpeechGenerationModel

    init(dir: String, model: any SpeechGenerationModel) {
        self.dir = dir
        self.model = model
    }
}

extension Engine {
    /// Little-endian float32 samples as base64, with their rate.
    func speak(_ request: SpeakRequest) async throws -> [String: any Sendable] {
        let speaker = try await speakerModel(request.modelDir)
        let audio = try await speaker.model.generate(
            text: request.text, voice: request.voice, refAudio: nil, refText: nil, language: nil)
        let samples = audio.asArray(Float.self)
        let bytes = samples.withUnsafeBufferPointer { Data(buffer: $0) }
        return ["sampleRate": speaker.model.sampleRate, "samples": bytes.base64EncodedString()]
    }
}
