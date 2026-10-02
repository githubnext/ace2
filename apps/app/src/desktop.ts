import { Electroview } from "electrobun/view";
import type { MouseEvent } from "react";

import type { DesktopRPC, HelperAction } from "@ace/desktop/protocol";

import { nativeToken } from "./host";

const rpc = Electroview.defineRPC<DesktopRPC>({
	// A native folder picker stays open until the person chooses a folder or cancels.
	maxRequestTime: Infinity,
	handlers: { requests: {}, messages: {} },
});

const token = nativeToken;
const view = token ? new Electroview({ rpc }) : undefined;

export const desktop = view && token
	? {
		project: () => rpc.request.project({ token }),
		lights: (expanded: boolean) => rpc.request.lights({ token, expanded }),
		zoom: () => rpc.request.zoom({ token }),
		helper: (action: HelperAction) => rpc.request.helper({ token, action }),
	}
	: undefined;

const CONTROL =
	"button,a,input,select,textarea,summary,[contenteditable=true],[role=button],[role=checkbox],[role=menuitem],[role=switch],[aria-haspopup]";

export function titlebar(event: MouseEvent<HTMLElement>) {
	if (!desktop || event.defaultPrevented || event.button !== 0 || event.clientY > 28) return;
	if (!(event.target instanceof Element) || event.target.closest(CONTROL)) return;
	event.preventDefault();
	void desktop.zoom();
}
