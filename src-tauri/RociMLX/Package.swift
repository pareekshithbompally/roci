// swift-tools-version: 6.2
// Roci's on-device models on MLX (chat, embeddings), built into RociMLX.framework and called from Rust over C.
import PackageDescription

let package = Package(
    name: "RociMLX",
    platforms: [.macOS(.v26), .iOS(.v26)],
    products: [.library(name: "RociMLX", type: .dynamic, targets: ["RociMLX"])],
    dependencies: [
        .package(url: "https://github.com/ml-explore/mlx-swift-lm", exact: "3.32.3"),
        .package(url: "https://github.com/huggingface/swift-transformers", from: "1.3.0"),
    ],
    targets: [
        .target(name: "RociMLX", dependencies: [
            .product(name: "MLXLLM", package: "mlx-swift-lm"),
            .product(name: "MLXLMCommon", package: "mlx-swift-lm"),
            .product(name: "MLXEmbedders", package: "mlx-swift-lm"),
            .product(name: "Tokenizers", package: "swift-transformers"),
        ]),
    ]
)
