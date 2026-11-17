// swift-tools-version: 6.2
// Roci's on-device models on MLX (chat, embeddings, read aloud), built into RociMLX.framework and called from Rust over C.
import PackageDescription

let package = Package(
    name: "RociMLX",
    platforms: [.macOS(.v26), .iOS(.v26)],
    products: [.library(name: "RociMLX", type: .dynamic, targets: ["RociMLX"])],
    dependencies: [
        // main at 2026-11-17: the MLX core (0.33) mlx-audio-swift needs; pinned by commit.
        .package(url: "https://github.com/ml-explore/mlx-swift-lm", revision: "bf5a5d43849722cde34bce495b06db95121ba7ec"),
        .package(url: "https://github.com/Neywa-Labs/mlx-audio-swift", exact: "0.2.0"),
        .package(url: "https://github.com/huggingface/swift-transformers", from: "1.3.0"),
    ],
    targets: [
        .target(name: "RociMLX", dependencies: [
            .product(name: "MLXLLM", package: "mlx-swift-lm"),
            .product(name: "MLXLMCommon", package: "mlx-swift-lm"),
            .product(name: "MLXEmbedders", package: "mlx-swift-lm"),
            .product(name: "Tokenizers", package: "swift-transformers"),
            .product(name: "MLXAudioTTS", package: "mlx-audio-swift"),
            .product(name: "MLXAudioCore", package: "mlx-audio-swift"),
        ]),
    ]
)
