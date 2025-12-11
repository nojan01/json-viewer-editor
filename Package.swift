// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "JSONViewerEditor",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "JSONViewerEditor",
            targets: ["JSONViewerEditor"]
        )
    ],
    targets: [
        .executableTarget(
            name: "JSONViewerEditor",
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "JSONViewerEditorTests",
            dependencies: ["JSONViewerEditor"]
        )
    ]
)
