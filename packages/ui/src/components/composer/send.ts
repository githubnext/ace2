type State = {
	text: string;
	attachments: Array<{ id: string }>;
	enabled?: boolean;
};

function canSendMessage({ text, attachments, enabled = true }: State) {
	return enabled && (!!text.trim() || attachments.length > 0);
}

export { canSendMessage };
