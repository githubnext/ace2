import type { Event, HostFrame, HostRequest, Listing, Request } from "@ace/host/protocol";

type Pending = {
	resolve(value: unknown): void;
	reject(error: Error): void;
	watch?: (event: Event) => void;
};
type Status = "connecting" | "open" | "closed";

/** One WebSocket to the local host gateway, reconnecting with backoff. */
export class Host {
	#socket?: WebSocket;
	#next = 1;
	#pending = new Map<number, Pending>();
	#listeners = new Set<() => void>();
	#retry = 250;
	status: Status = "connecting";
	channels: Listing[] = [];
	/** Called after every reconnect so watches can be re-established. */
	onOpen?: () => void;

	constructor(readonly url: string) {
		this.#connect();
	}

	#connect() {
		const socket = new WebSocket(this.url);
		this.#socket = socket;
		socket.addEventListener("open", () => {
			this.#retry = 250;
			this.#set("open");
			this.request<Listing[]>({ op: "channels" }).then((channels) => {
				this.channels = channels;
				this.#emit();
			});
			this.onOpen?.();
		});
		socket.addEventListener(
			"message",
			(message) => this.#receive(JSON.parse(String(message.data)) as HostFrame),
		);
		socket.addEventListener("close", () => {
			for (const pending of this.#pending.values()) {
				pending.reject(new Error("Disconnected from the host"));
			}
			this.#pending.clear();
			this.#set("closed");
			setTimeout(() => this.#connect(), this.#retry);
			this.#retry = Math.min(this.#retry * 2, 5000);
		});
	}

	#receive(frame: HostFrame) {
		if ("channels" in frame) {
			this.channels = frame.channels;
			return this.#emit();
		}
		const pending = this.#pending.get(frame.id);
		if ("event" in frame) return pending?.watch?.(frame.event);
		// A watch keeps its entry so later events still reach it.
		if (!pending?.watch || !frame.ok) this.#pending.delete(frame.id);
		if (frame.ok) return pending?.resolve(frame.value);
		pending?.reject(new Error(frame.error));
	}

	#set(status: Status) {
		this.status = status;
		this.#emit();
	}

	#emit() {
		for (const listener of this.#listeners) listener();
	}

	subscribe = (listener: () => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	request<T = unknown>(request: HostRequest, watch?: (event: Event) => void): Promise<T> {
		const id = this.#next++;
		const promise = new Promise<T>((resolve, reject) =>
			this.#pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				...(watch ? { watch } : {}),
			})
		);
		this.#socket?.send(JSON.stringify({ id, ...request }));
		return promise;
	}

	channel<T = unknown>(
		channel: string,
		request: Request,
		watch?: (event: Event) => void,
	): Promise<T> {
		return this.request<T>({ op: "channel", channel, request }, watch);
	}
}

const scheme = location.protocol === "https:" ? "wss:" : "ws:";
export const host = new Host(import.meta.env.VITE_ACE_HOST || `${scheme}//${location.host}/ws`);
