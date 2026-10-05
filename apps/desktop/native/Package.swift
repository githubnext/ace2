// swift-tools-version: 6.2

import PackageDescription

let package = Package(
	name: "AceNative",
	platforms: [.macOS(.v15)],
	products: [
		.library(name: "AceDesktop", type: .dynamic, targets: ["AceDesktop"]),
		.executable(name: "ace-desktop-client", targets: ["AceDesktopClient"]),
	],
	dependencies: [
		.package(url: "https://github.com/openclaw/Peekaboo.git", exact: "4.8.0"),
	],
	targets: [
		.target(
			name: "AceSigning",
			path: "sources/signing",
			linkerSettings: [.linkedFramework("Security")]
		),
		.target(
			name: "AceDesktop",
			dependencies: ["AceSigning", .product(name: "PeekabooBridge", package: "Peekaboo")],
			path: "sources/desktop"
		),
		.executableTarget(
			name: "AceDesktopClient",
			dependencies: [
				"AceSigning",
				.product(name: "PeekabooBridge", package: "Peekaboo"),
				.product(name: "PeekabooAutomationKit", package: "Peekaboo"),
			],
			path: "sources/client"
		),
	],
	swiftLanguageModes: [.v6]
)
