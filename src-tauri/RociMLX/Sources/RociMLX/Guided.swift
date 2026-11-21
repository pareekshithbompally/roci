// Schema-constrained replies: xgrammar (mlx-swift-lm's MLXGuidedGeneration) lets only the tokens that keep the JSON valid for
// the schema through, so even a small model answers in exactly the shape asked for.

import MLX
import MLXGuidedGeneration
import MLXLMCommon

/// What decoding to a schema needs from one loaded model's tokenizer; built once per model (scanning the vocabulary is the
/// costly part), immutable after.
struct GrammarKit: @unchecked Sendable {
    let tokenizer: GrammarTokenizer
    let closing: MLXArray
    let whitespace: MLXArray
    let whitespaceIDs: Set<Int>

    /// The reply's length when the request sets none, as the package's own adapter allows.
    private static let defaultMaxTokens = 4096

    init(_ host: any Tokenizer) throws {
        let vocabulary = TokenizerVocabExtractor.extractForGrammar(from: host)
        tokenizer = try GrammarTokenizer(
            vocab: vocabulary.vocab, vocabType: vocabulary.vocabType, eosTokenId: Int32(host.eosTokenId ?? 0))
        closing = ClosingTokenBias.compute(tokenizer: host, eosTokenId: host.eosTokenId)
        (whitespace, whitespaceIDs) = WhitespaceTokenBias.compute(tokenizer: host)
    }

    /// Generates JSON for `schema`, handing each piece to `emit` (false stops); returns the tokens generated.
    /// The completion reserves are the package adapter's: room left at the end to close every open structure.
    func generate(
        schema: String, input: LMInput, context: ModelContext, maxTokens: Int?, emit: (String) -> Bool
    ) throws -> Int {
        let constraint = try GrammarConstraint(
            tokenizer: tokenizer, jsonSchema: schema, fastForward: true, hostTokenizer: context.tokenizer)
        let limit = maxTokens ?? Self.defaultMaxTokens
        let structural = CompletionReserve.estimate(schemaJSON: schema, tokenizer: context.tokenizer)
        do {
            return try GuidedGenerationLoop.run(
                input: input, context: context, constraint: constraint, maxTokens: limit,
                vocabSize: tokenizer.vocabSize, completionReserve: max(structural * 3, limit / 4),
                hardReserve: structural * 8, closingBias: closing, whitespaceBias: whitespace,
                whitespaceTokenIDs: whitespaceIDs, prefill: Checkpoint.prefill, emit: emit)
        } catch GuidedGenerationError.incompleteOutput, GuidedGenerationError.prematureEOS {
            throw EngineError(description: "The model stopped before its answer was complete.")
        }
    }
}
