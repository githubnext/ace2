import type { Block } from "../../lib/block";

import { FileView } from "./file-view";
import { FILE_HEIGHT } from "./constants";

/** File attachment block with fixed height. */
function file(name: string, size: string): Block {
	return {
		measure(width) {
			return { height: FILE_HEIGHT, fit: width };
		},
		render() {
			return <FileView name={name} size={size} />;
		},
	};
}

export { file };
