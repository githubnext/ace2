import type { Artifact, EditedFile } from "../../lib/timeline";

const ARTIFACT_PREVIEW = 3;
const FILE_PREVIEW = 5;
const CARD_BORDER = 2;
const CARD_GAP = 8;
const ARTIFACT_ROW = 60;
const FILE_HEADER_PAD_Y = 8;
const FILE_HEADER = 44;
const FILE_ROW_SEPARATOR = 1;
const FILE_ROW = 36;
const SHOW_MORE_HEIGHT = 34;

function turnSummaryHeight(
	artifacts: Artifact[],
	files: EditedFile[],
	artifactsExpanded: boolean,
	filesExpanded: boolean,
): number {
	let height = 0;
	let cards = 0;
	if (artifacts.length) {
		height += artifactHeight(artifacts.length, artifactsExpanded);
		cards++;
	}
	if (files.length) {
		height += filesHeight(files.length, filesExpanded);
		cards++;
	}
	if (cards > 1) height += CARD_GAP;
	return height;
}

function artifactHeight(count: number, expanded: boolean): number {
	let rows = expanded ? count : Math.min(count, ARTIFACT_PREVIEW);
	return CARD_BORDER + rows * ARTIFACT_ROW + showMoreHeight(count, ARTIFACT_PREVIEW);
}

function filesHeight(count: number, expanded: boolean): number {
	let rows = expanded ? count : Math.min(count, FILE_PREVIEW);
	return CARD_BORDER + FILE_HEADER + FILE_ROW_SEPARATOR + rows * FILE_ROW
		+ showMoreHeight(count, FILE_PREVIEW);
}

function showMoreHeight(count: number, preview: number): number {
	return count > preview ? SHOW_MORE_HEIGHT : 0;
}

export {
	CARD_GAP as TURN_SUMMARY_CARD_GAP,
	FILE_PREVIEW as TURN_SUMMARY_FILE_PREVIEW,
	FILE_ROW as TURN_SUMMARY_FILE_ROW,
	turnSummaryHeight,
};

export {
	ARTIFACT_PREVIEW,
	ARTIFACT_ROW,
	CARD_GAP,
	FILE_HEADER,
	FILE_HEADER_PAD_Y,
	FILE_PREVIEW,
	FILE_ROW,
	SHOW_MORE_HEIGHT,
};
