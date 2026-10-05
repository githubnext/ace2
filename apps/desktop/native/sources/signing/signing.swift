import Foundation
import Security

public struct SigningIdentity: Sendable {
	public let identifier: String
	public let team: String

	public static func current() throws -> Self {
		var code: SecCode?
		guard SecCodeCopySelf(SecCSFlags(), &code) == errSecSuccess, let code else {
			throw SigningError()
		}
		var staticCode: SecStaticCode?
		guard SecCodeCopyStaticCode(code, SecCSFlags(), &staticCode) == errSecSuccess,
			let staticCode
		else { throw SigningError() }
		var information: CFDictionary?
		guard SecCodeCopySigningInformation(
			staticCode,
			SecCSFlags(rawValue: UInt32(kSecCSSigningInformation)),
			&information
		) == errSecSuccess,
			let values = information as? [String: Any],
			let identifier = values[kSecCodeInfoIdentifier as String] as? String,
			let team = values[kSecCodeInfoTeamIdentifier as String] as? String,
			!identifier.isEmpty, !team.isEmpty
		else { throw SigningError() }

		let text = "anchor apple generic and identifier \(quoted(identifier)) "
			+ "and certificate leaf[subject.OU] = \(quoted(team))"
		var requirement: SecRequirement?
		guard SecRequirementCreateWithString(text as CFString, SecCSFlags(), &requirement) == errSecSuccess,
			let requirement,
			SecCodeCheckValidity(code, SecCSFlags(), requirement) == errSecSuccess
		else { throw SigningError() }
		return Self(identifier: identifier, team: team)
	}
}

private func quoted(_ value: String) -> String {
	"\"" + value.replacingOccurrences(of: "\\", with: "\\\\")
		.replacingOccurrences(of: "\"", with: "\\\"") + "\""
}

private struct SigningError: LocalizedError {
	var errorDescription: String? {
		"Native desktop tools require Ace and its bundled client to be signed with an Apple Development or Developer ID identity."
	}
}
