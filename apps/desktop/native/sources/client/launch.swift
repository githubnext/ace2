import CoreGraphics
import Foundation
import PeekabooAutomationKit
import PeekabooBridge
import PeekabooFoundation

private struct LaunchError: LocalizedError {
	let message: String
	init(_ message: String) { self.message = message }
	var errorDescription: String? { message }
}

private struct LaunchedApplication: Encodable {
	let name: String
	let bundle_id: String?
	let path: String?
	let target: ManagementTarget
}

private struct LaunchMessage: Encodable {
	let code: String
	let message: String
	let hint: String?
}

private struct LaunchResult: Encodable {
	let action = "launch"
	var outcome = "refused"
	var native_outcome: DesktopActionOutcome?
	var application: LaunchedApplication?
	var requires_fresh_observation = false
	var error: LaunchMessage?
}

private struct LaunchReply: Encodable {
	let success = true
	let data: LaunchResult
	let target_receipt: Receipt?
}

func nativeLaunch(_ client: PeekabooBridgeClient, handshake: PeekabooBridgeHandshakeResponse) async throws -> Data {
	var result = LaunchResult()
	var receipt: Receipt?
	var invoked = false
	let uncertain = "The app may still open later. Observe desktop_apps before any further action; do not blindly repeat the launch."
	do {
		let request = try readLaunch()
		guard handshake.supportedOperations.contains(.launchApplicationWithOptions),
			(handshake.enabledOperations ?? handshake.supportedOperations).contains(.launchApplicationWithOptions)
		else { throw LaunchError("The desktop runtime does not support attested application launch. Update the runtime before acting.") }
		let session = CGSessionCopyCurrentDictionary() as NSDictionary?
		if session?["CGSSessionScreenIsLocked"] as? Bool == true {
			throw DesktopActionFailure.preDispatchRefusal(
				reason: .targetUnavailable,
				message: "The macOS GUI session is locked. Application launch was not dispatched.",
				hint: "Unlock the active user session before choosing a new action."
			)
		}
		// Verify signed operation support before a launch whose process does not exist yet.
		_ = try await client.listApplicationMutationInventory()
		guard let preflight = await client.lastOperationReceipt(), preflight.payload.operation == PeekabooBridgeRequest.listApplicationMutationInventory.operation else {
			throw LaunchError("The native runtime cannot attest application targets. Update the desktop runtime before acting.")
		}
		try Task.checkCancellation()
		invoked = true
		let action = try await client.launchApplicationResult(request: request)
		result.native_outcome = action.outcome
		guard let process = action.payload.processIdentity,
			let signed = await client.lastOperationReceipt(), signed.payload.operation == .launchApplicationWithOptions,
			let outcome = action.outcome, signed.payload.outcome?.outcome == outcome,
			case let .process(identity) = signed.payload.target, identity == process
		else { throw LaunchError("The launch returned without its matching signed process receipt and outcome.") }
		// The bridge validates the requested selector against this signed application response.
		receipt = Receipt(pid: process.processIdentifier, window_id: nil, process_start_identity_decimal: String(process.processStartIdentity))
		result.application = LaunchedApplication(name: action.payload.name, bundle_id: action.payload.bundleIdentifier,
			path: action.payload.bundlePath, target: ManagementTarget(process))
		result.requires_fresh_observation = outcome.dispatchState.mutationDispatched
		switch outcome.state {
		case .confirmedChange, .confirmedNoChange: result.outcome = "completed"
		case .refused: result.outcome = "refused"
		default: result.outcome = "unknown"
		}
	} catch let failure as DesktopActionFailure {
		let dispatched = failure.outcome.dispatchState.mutationDispatched
		result.outcome = dispatched ? "unknown" : "refused"
		result.native_outcome = failure.outcome
		result.requires_fresh_observation = dispatched
		result.error = LaunchMessage(code: failure.standardErrorCode?.rawValue ?? "DESKTOP_ACTION_FAILED",
			message: failure.message, hint: dispatched ? uncertain : failure.hint)
	} catch {
		result.outcome = invoked ? "unknown" : "refused"
		result.requires_fresh_observation = invoked
		result.error = LaunchMessage(code: (error as? PeekabooBridgeErrorEnvelope)?.code.rawValue ?? "DESKTOP_ACTION_FAILED",
			message: error.localizedDescription, hint: invoked ? uncertain : nil)
	}
	return try JSONEncoder().encode(LaunchReply(data: result, target_receipt: receipt))
}

private func readLaunch() throws -> ApplicationLaunchRequest {
	var data = Data()
	while let chunk = try FileHandle.standardInput.read(upToCount: 4096), !chunk.isEmpty {
		data.append(chunk)
		guard data.count <= 16_384 else { throw LaunchError("The launch request exceeds 16 KiB.") }
	}
	guard let request = try JSONSerialization.jsonObject(with: data) as? [String: Any],
		Set(request.keys) == ["op", "application"], request["op"] as? String == "launch",
		let application = request["application"] as? [String: Any], application.count == 1
	else { throw LaunchError("Launch accepts exactly one application path or bundle_id.") }
	let path = application["path"] as? String
	let bundleID = application["bundle_id"] as? String
	if let path {
		var directory: ObjCBool = false
		guard path.utf16.count <= 4096, path.hasPrefix("/"), path.lowercased().hasSuffix(".app"), !path.contains("\0"),
			FileManager.default.fileExists(atPath: path, isDirectory: &directory), directory.boolValue,
			Bundle(url: URL(fileURLWithPath: path))?.executableURL != nil
		else { throw LaunchError("Use an existing absolute .app path for launch.") }
	} else {
		guard let bundleID, bundleID.utf16.count <= 256,
			bundleID.range(of: "^[A-Za-z0-9.-]+$", options: .regularExpression) != nil
		else { throw LaunchError("Use an exact application bundle ID for launch.") }
	}
	return ApplicationLaunchRequest(applicationIdentifier: path, applicationBundleIdentifier: bundleID,
		activates: true, waitUntilReady: true, waitForWindow: false, createsNewInstance: false)
}
