import { Agentation } from "agentation";
import { useEffect, useState } from "react";

const LAUNCHER = 'button[aria-label="Start feedback mode"], button[aria-label="Exit"]';

// Ace owns visibility; Agentation's session hide setting would disable the native shortcut.
sessionStorage.removeItem("agentation-session-toolbar-hidden");

export default function Annotations() {
	const [container, setContainer] = useState<HTMLElement | null>(null);
	useEffect(() => {
		// Keep feedback inside the active dialog's focus and accessibility boundary.
		function followDialog() {
			const dialogs = document.querySelectorAll<HTMLElement>(
				'[data-slot="dialog-content"][data-open]',
			);
			setContainer(dialogs.item(dialogs.length - 1));
		}
		const observer = new MutationObserver(followDialog);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-open"],
		});
		followDialog();
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		let shadow: ShadowRoot | undefined;
		let pending = location.hash === "#annotations-toggle";
		if (pending) history.replaceState(null, "", location.pathname + location.search);

		function toggle() {
			if (!shadow) {
				pending = !pending;
				return;
			}
			shadow.querySelector<HTMLButtonElement>(LAUNCHER)!.click();
		}

		// Agentation 3.1.2 has no controlled-open API. Keep it mounted so toggling retains feedback.
		const style = document.createElement("style");
		style.textContent = `
			[data-agentation-toolbar]:has(button[aria-label="Start feedback mode"][aria-expanded="false"]) {
				display: none;
			}
			[data-agentation-settings-panel] div:has(> div > input[aria-label="Hide Until Restart"]) {
				display: none;
			}
		`;
		function attach() {
			const root = document.querySelector(".ace-annotations")?.shadowRoot;
			if (!root) return;
			if (!root.querySelector(LAUNCHER)) {
				observer.observe(root, { childList: true, subtree: true });
				return;
			}
			shadow = root;
			root.append(style);
			root.host.setAttribute("data-ace-ready", "");
			observer.disconnect();
			if (pending) toggle();
		}
		const observer = new MutationObserver(attach);
		observer.observe(document.body, { childList: true, subtree: true });
		window.addEventListener("ace:annotations-toggle", toggle);
		attach();
		return () => {
			observer.disconnect();
			window.removeEventListener("ace:annotations-toggle", toggle);
			shadow?.host.removeAttribute("data-ace-ready");
			style.remove();
		};
	}, []);

	return (
		<Agentation
			appName="Ace"
			className="ace-annotations"
			enableKeyboardShortcuts={false}
			portalContainer={container}
		/>
	);
}
