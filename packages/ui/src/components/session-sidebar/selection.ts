import type { SidebarRow } from "../session-item/session-item.types";

export function isSidebarRowSelected(row: SidebarRow, selectedUid?: SidebarRow["uid"]) {
	if (!selectedUid) return false;
	return row.uid === selectedUid || row.creating?.sessionUid === selectedUid;
}
