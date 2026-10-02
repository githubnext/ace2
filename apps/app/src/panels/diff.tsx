import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { DiffView, type DiffViewFile } from "@ace/ui";
import type { Change, Changes } from "@ace/channel/protocol";

import { host } from "../host";

type Props = { channel: string; chat: number; active: boolean };

/** A loaded patch or its failure, for the version of the file described by `stamp`. */
type Loaded = { stamp: string; patch?: string; signature?: string; error?: string };

const POLL = 2000;
const LIMIT = 4;

function stamp(change: Change) {
	return `${change.from || ""}>${change.adds},${change.dels},${change.binary}`;
}

function same(a: Changes | undefined, b: Changes) {
	if (!a || a.lane !== b.lane || a.base !== b.base || a.head !== b.head) return false;
	if (a.files.length !== b.files.length) return false;
	return a.files.every((change, i) =>
		change.file === b.files[i]!.file && stamp(change) === stamp(b.files[i]!)
	);
}

function signature(source: string) {
	let hash = 0x811c9dc5;
	for (let i = 0; i < source.length; i++) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${source.length}:${(hash >>> 0).toString(36)}`;
}

function short(ref: string) {
	return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}

function subscribe(listener: () => void) {
	window.addEventListener("focus", listener);
	window.addEventListener("blur", listener);
	return () => {
		window.removeEventListener("focus", listener);
		window.removeEventListener("blur", listener);
	};
}

function Note({ children }: { children: string }) {
	return (
		<section className="grid h-full min-h-0 place-items-center bg-background px-4 text-center text-sm text-muted-foreground">
			{children}
		</section>
	);
}

/** The chat's changes, polled while the tab is visible and the window focused. */
export function Diff({ channel, chat, active }: Props) {
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const focused = useSyncExternalStore(subscribe, () => document.hasFocus());
	const [changes, setChanges] = useState<Changes>();
	const [error, setError] = useState<string>();
	const [loaded, setLoaded] = useState(new Map<string, Loaded>());
	const [first, setFirst] = useState<string>();
	const inflight = useRef(new Set<string>());

	useEffect(() => {
		if (!active || !focused || status !== "open") return;
		let live = true;
		let timer: ReturnType<typeof setTimeout>;
		const poll = () =>
			host.channel<Changes>(channel, { op: "changes", chat }).then(
				(next) => {
					if (!live) return;
					setChanges((current) => same(current, next) ? current : next);
					setError(undefined);
				},
				(error: Error) => {
					if (live) setError(error.message);
				},
			).finally(() => {
				if (live) timer = setTimeout(poll, POLL);
			});
		void poll();
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [channel, chat, active, focused, status]);

	useEffect(() => {
		if (!changes || status !== "open") return;
		const wanted = changes.files.filter((change) =>
			!change.binary && loaded.get(change.file)?.stamp !== stamp(change)
		);
		const index = wanted.findIndex((change) => change.file === first);
		if (index > 0) wanted.unshift(...wanted.splice(index, 1));

		for (const change of wanted) {
			if (inflight.current.size >= LIMIT) return;
			const version = stamp(change);
			const key = `${change.file}\0${version}`;
			if (inflight.current.has(key)) continue;
			inflight.current.add(key);
			host.channel<string>(channel, { op: "patch", chat, file: change.file }).then(
				(patch) => ({ stamp: version, patch, signature: signature(patch) }),
				(error: Error) =>
					// A dropped connection isn't the file's failure; it reloads once reconnected.
					host.status === "open" ? { stamp: version, error: error.message } : undefined,
			).then((value) => {
				inflight.current.delete(key);
				setLoaded((current) => {
					const next = new Map(current);
					if (value) next.set(change.file, value);
					return next;
				});
			});
		}
	}, [channel, chat, changes, loaded, first, status]);

	const files = useMemo(
		() =>
			(changes?.files || []).map((change): DiffViewFile => {
				const value = loaded.get(change.file);
				const current = value?.stamp === stamp(change) ? value : undefined;
				return {
					file: change.file,
					from: change.from,
					binary: change.binary,
					adds: change.adds,
					dels: change.dels,
					patch: current?.patch,
					signature: current?.signature,
					error: current?.error,
					pending: !change.binary && !current,
				};
			}),
		[changes, loaded],
	);

	function open(file: string) {
		setFirst(file);
		// Reopening a file that failed retries it.
		if (!loaded.get(file)?.error) return;
		setLoaded((current) => {
			const next = new Map(current);
			next.delete(file);
			return next;
		});
	}

	if (!changes) return <Note>{error || "Loading changes…"}</Note>;

	return (
		<DiffView
			files={files}
			base={short(changes.base)}
			head={changes.lane || short(changes.head)}
			onFileOpen={open}
			className="rounded-none border-0"
		/>
	);
}
