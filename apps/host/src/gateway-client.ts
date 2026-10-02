/** A client of a host gateway, shared by the app and by hosts reaching their tailnet peers. */
import type { Event, HostFrame, HostRequest, Listing, Project, Request } from "./protocol";

type Pending = {
	resolve(value: unknown): void;
	reject(error: Error): void;
	watch?: (event: Event) => void;
};
export type Status = "connecting" | "open" | "closed";

/** One WebSocket to a host gateway, reconnecting with backoff until closed. */
export class GatewayClient {
	#socket?: WebSocket;
	#next = 1;
	#pending = new Map<number, Pending>();
	#listeners = new Set<() => void>();
	#retry = 250;
	#closed = false;
	status: Status = "connecting";
	channels: Listing[] = [];
	projects: Project[] = [];
	settingsVersion = 0;
	/** Called after every connect so watches can be re-established. */
	onOpen?: () => void;

	constructor(readonly url: string, private readonly token?: string) {
		this.#connect();
	}

	#connect() {
		if (this.#closed) return;
		const socket = new WebSocket(
			this.url,
			this.token ? ["ace", `ace-token.${this.token}`] : undefined,
		);
		this.#socket = socket;
		socket.addEventListener("open", () => {
			this.#retry = 250;
			this.#set("open");
			this.request<Listing[]>({ op: "channels" }).then((channels) => {
				this.channels = channels;
				this.#emit();
			}, () => {});
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
			this.channels = [];
			this.#set("closed");
			if (this.#closed) return;
			setTimeout(() => this.#connect(), this.#retry);
			this.#retry = Math.min(this.#retry * 2, 5000);
		});
	}

	#receive(frame: HostFrame) {
		if ("projects" in frame) {
			this.projects = frame.projects;
			return this.#emit();
		}
		if ("settings" in frame) {
			this.settingsVersion++;
			return this.#emit();
		}
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

	request<T = unknown>(
		request: HostRequest,
		watch?: (event: Event) => void,
		trace?: string,
	): Promise<T> {
		if (this.status !== "open") return Promise.reject(new Error("Not connected to the host"));
		const id = this.#next++;
		const promise = new Promise<T>((resolve, reject) =>
			this.#pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				...(watch ? { watch } : {}),
			})
		);
		this.#socket?.send(JSON.stringify({ id, ...(trace ? { trace } : {}), ...request }));
		return promise;
	}

	channel<T = unknown>(
		channel: string,
		request: Request,
		watch?: (event: Event) => void,
		trace?: string,
	): Promise<T> {
		return this.request<T>({ op: "channel", channel, request }, watch, trace);
	}

	close() {
		this.#closed = true;
		this.#socket?.close();
	}
}
