import AppKit
import Darwin
import Foundation

private struct ProjectStatus: Encodable {
	var pending = false
	var path: String?
	var error: String?

	private enum CodingKeys: String, CodingKey { case pending, path, error }

	func encode(to encoder: any Encoder) throws {
		var values = encoder.container(keyedBy: CodingKeys.self)
		try values.encode(pending, forKey: .pending)
		try values.encode(path, forKey: .path)
		try values.encodeIfPresent(error, forKey: .error)
	}
}

private final class ProjectState: @unchecked Sendable {
	private let lock = NSLock()
	private var value = ProjectStatus()
	private var closed = false

	func begin() -> Bool {
		lock.lock()
		defer { lock.unlock() }
		guard !closed, !value.pending else { return false }
		value = ProjectStatus(pending: true)
		return true
	}

	func read() -> ProjectStatus {
		lock.lock()
		defer { lock.unlock() }
		return value
	}

	func finish(path: String? = nil, error: String? = nil) {
		lock.lock()
		defer { lock.unlock() }
		guard value.pending else { return }
		value = ProjectStatus(path: path, error: error)
	}

	func open() {
		lock.lock()
		defer { lock.unlock() }
		closed = false
	}

	func close() {
		lock.lock()
		defer { lock.unlock() }
		closed = true
		value = ProjectStatus()
	}
}

private let project = ProjectState()

@MainActor
private final class ProjectPicker {
	static let shared = ProjectPicker()
	private var panel: NSOpenPanel?

	func start(path: String) {
		guard project.read().pending else { return }
		let panel = NSOpenPanel()
		panel.directoryURL = URL(fileURLWithPath: path, isDirectory: true)
		panel.canChooseDirectories = true
		panel.canChooseFiles = false
		panel.allowsMultipleSelection = false
		self.panel = panel
		// A synchronous modal call holds the main queue while the desktop bridge needs its MainActor.
		panel.begin { [weak self, weak panel] response in
			Task { @MainActor in
				guard let self, let panel, self.panel === panel else { return }
				self.panel = nil
				switch response {
				case .OK:
					guard let path = panel.url?.path else {
						project.finish(error: "The folder picker returned no project folder.")
						return
					}
					project.finish(path: path)
				case .cancel:
					project.finish()
				default:
					project.finish(error: "The project folder picker could not open.")
				}
			}
		}
	}

	func cancel() {
		let current = panel
		panel = nil
		current?.cancel(nil)
	}
}

func openProjectPicker() {
	project.open()
}

func closeProjectPicker() {
	project.close()
	DispatchQueue.main.async { ProjectPicker.shared.cancel() }
}

@_cdecl("ace_desktop_project_start")
public func projectStart(_ path: UnsafePointer<CChar>) {
	let path = String(cString: path)
	guard project.begin() else { return }
	DispatchQueue.main.async { ProjectPicker.shared.start(path: path) }
}

@_cdecl("ace_desktop_project_status")
public func projectStatus() -> UnsafeMutablePointer<CChar>? {
	let data = try! JSONEncoder().encode(project.read())
	return strdup(String(decoding: data, as: UTF8.self))
}
