import { Electroview } from "electrobun/view";

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
		helper: (action: HelperAction) => rpc.request.helper({ token, action }),
	}
	: undefined;
