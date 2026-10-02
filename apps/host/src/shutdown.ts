import * as catalog from "./catalog";
import { Connection } from "./client";
import type { WorkerInfo } from "./protocol";

async function close(id: string): Promise<void> {
	const connection = await Connection.running(id);
	if (!connection) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			(async () => {
				// Stale pid files must never cause the host to signal an unrelated process.
				const worker = await connection.request<WorkerInfo>({ op: "worker" });
				if (worker.id !== id || !Number.isSafeInteger(worker.pid) || worker.pid <= 0) {
					throw new Error(`Cannot identify the worker for channel ${id}`);
				}
				try {
					process.kill(worker.pid, "SIGTERM");
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
				}
				await connection.closed;
			})(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`Channel ${id} did not close within 10 seconds`)),
					10_000,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
		connection.close();
	}
}

/** A host shutdown suspends local work; it must not write pi's durable abort marks. */
export async function shutdown(): Promise<void> {
	const results = await Promise.allSettled(
		catalog.list().filter((record) => !record.hosted).map((record) => close(record.id)),
	);
	const failures = results.filter((result) => result.status === "rejected");
	if (failures.length) {
		throw new AggregateError(
			failures.map((result) => result.reason),
			"Some channel workers did not close",
		);
	}
}
