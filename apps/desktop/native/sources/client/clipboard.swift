import Foundation
import PeekabooAutomationKit
import PeekabooBridge
import PeekabooFoundation

private struct ClipboardRequest: Decodable {
	let op: String
	let kind: ClipboardValue.Kind?
	let path: String?
	let snapshot: String?
	let value: Value?

	struct Value: Decodable {
		let kind: ClipboardValue.Kind
		let text: String?
		let path: String?
		let paths: [String]?

		func payload() throws -> ClipboardValue {
			let result: ClipboardValue
			switch kind {
			case .text:
				guard path == nil, paths == nil, let text, text.utf16.count <= 8192 else {
					throw ClipboardError("Supply complete text of at most 8,192 UTF-16 code units.")
				}
				result = .init(kind: kind, text: text)
			case .image:
				guard text == nil, paths == nil, let path, path.hasPrefix("/"), !path.contains("\0") else {
					throw ClipboardError("Supply an absolute image path on the execution host.")
				}
				let url = URL(fileURLWithPath: path)
				let attributes = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
				guard attributes.isRegularFile == true, let size = attributes.fileSize, size <= 10 * 1024 * 1024 else {
					throw ClipboardError("Use an ordinary image file of at most 10 MiB.")
				}
				let handle = try FileHandle(forReadingFrom: url)
				defer { try? handle.close() }
				let data = try handle.read(upToCount: 10 * 1024 * 1024 + 1) ?? Data()
				_ = try ClipboardValue.imageInfo(data)
				result = .init(kind: kind, image: data)
			case .files:
				guard text == nil, path == nil, let paths else { throw ClipboardError("Supply absolute file or folder paths.") }
				result = .init(kind: kind, paths: paths)
			}
			_ = try result.writeRequest()
			if let paths = result.paths {
				for path in paths {
					let values = try URL(fileURLWithPath: path).resolvingSymlinksInPath()
						.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey])
					guard values.isRegularFile == true || values.isDirectory == true else {
						throw ClipboardError("Clipboard file items must be existing ordinary files or folders.")
					}
				}
			}
			return result
		}
	}
}

private struct ClipboardError: LocalizedError {
	let message: String
	init(_ message: String) { self.message = message }
	var errorDescription: String? { message }
}

private struct ClipboardReply<T: Encodable>: Encodable {
	let success = true
	let data: T
	var target_receipt: PeekabooBridgeClipboardReceipt?
}

private struct ClipboardRefusal: Encodable {
	var outcome = "refused"
	var native_outcome: DesktopActionOutcome?
	var clipboard_changed: Bool?
	var clipboard_cleanup: String?
	var consumption: String?
	let error: ClipboardMessage
}

private struct ClipboardMessage: Encodable {
	let code: String
	let message: String
	var hint: String?
}

func nativeClipboard(_ client: PeekabooBridgeClient) async throws -> Data {
	var input = Data()
	while let chunk = try FileHandle.standardInput.read(upToCount: 4096), !chunk.isEmpty {
		input.append(chunk)
		guard input.count <= 65_536 else { throw ClipboardError("The clipboard request exceeds 64 KiB.") }
	}
	let request = try JSONDecoder().decode(ClipboardRequest.self, from: input)
	if request.op == "clipboard-read" {
		guard let kind = request.kind, request.value == nil, request.snapshot == nil,
			(kind == .image ? request.path?.hasPrefix("/") == true : request.path == nil)
		else { throw ClipboardError("Choose text, image, or files; only image reads require an output path.") }
		var contents = try await client.clipboardRead(kind: kind)
		if kind == .image, contents.present {
			guard let data = contents.imageData, let info = contents.image,
				info.bytes == data.count, info.mimeType == (try ClipboardValue.imageInfo(data)).mimeType
			else { throw ClipboardError("The clipboard returned an invalid image payload.") }
			// The host owns this private staging path and publishes the artifact without overwriting existing files.
			try data.write(to: URL(fileURLWithPath: request.path!), options: [.withoutOverwriting])
		}
		contents.imageData = nil
		return try JSONEncoder().encode(ClipboardReply(data: contents))
	}
	var dispatched = false
	do {
		guard ["clipboard-write", "paste"].contains(request.op), request.kind == nil, request.path == nil,
			let value = request.value,
			(request.op == "paste" ? request.snapshot?.isEmpty == false : request.snapshot == nil)
		else { throw ClipboardError("Choose clipboard-write with a value, or paste with a value and snapshot.") }
		let payload = try value.payload()
		if let snapshot = request.snapshot, snapshot.utf16.count > 256 {
			throw ClipboardError("Use a snapshot ID returned by desktop_inspect.")
		}
		dispatched = true
		var result = request.op == "paste"
			? try await client.clipboardPaste(snapshot: request.snapshot!, value: payload)
			: try await client.clipboardWrite(value: payload)
		let receipt = result.target_receipt
		result.target_receipt = nil
		return try JSONEncoder().encode(ClipboardReply(data: result, target_receipt: receipt))
	} catch let failure as DesktopActionFailure {
		let changed = failure.outcome.dispatchState.mutationDispatched
		var result = ClipboardRefusal(
			native_outcome: failure.outcome,
			clipboard_changed: changed ? nil : false,
			clipboard_cleanup: request.op == "paste" && !changed ? "not_needed" : nil,
			consumption: request.op == "paste" ? "unverified" : nil,
			error: .init(code: failure.standardErrorCode?.rawValue ?? "CLIPBOARD_FAILED", message: failure.message, hint: failure.hint)
		)
		result.outcome = changed ? "unknown" : "refused"
		return try JSONEncoder().encode(ClipboardReply(data: result))
	} catch {
		var result = ClipboardRefusal(
			clipboard_changed: dispatched ? nil : false,
			clipboard_cleanup: request.op == "paste" && !dispatched ? "not_needed" : nil,
			consumption: request.op == "paste" ? "unverified" : nil,
			error: .init(code: "CLIPBOARD_FAILED", message: error.localizedDescription)
		)
		result.outcome = dispatched ? "unknown" : "refused"
		return try JSONEncoder().encode(ClipboardReply(data: result))
	}
}
