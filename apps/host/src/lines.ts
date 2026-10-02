import type { Socket } from "node:net";

/** Calls `receive` with each complete newline-delimited line from the socket. */
export function lines(socket: Socket, receive: (line: string) => void): void {
	let buffer = "";
	socket.setEncoding("utf8");
	socket.on("data", (chunk: string) => {
		buffer += chunk;
		let end = buffer.indexOf("\n");
		while (end >= 0) {
			const line = buffer.slice(0, end);
			buffer = buffer.slice(end + 1);
			if (line) receive(line);
			end = buffer.indexOf("\n");
		}
	});
}
