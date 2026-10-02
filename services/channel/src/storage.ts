import type {
	SqliteDatabase,
	SqliteExecutor,
	SqliteValue,
} from "@earendil-works/pi-durable/storage/sqlite";

/** Workers SQL takes ArrayBuffers and safe-range numbers where pi passes byte arrays and bigints. */
function bind(value: SqliteValue): unknown {
	if (value instanceof Uint8Array) return value.slice().buffer;
	if (typeof value === "bigint") return Number(value);
	return value;
}

function row<T extends object>(raw: Record<string, unknown>): T {
	for (const [key, value] of Object.entries(raw)) {
		if (value instanceof ArrayBuffer) raw[key] = new Uint8Array(value);
	}
	return raw as T;
}

/**
 * pi's portable SQLite core on a Durable Object's database. Workers SQL is synchronous and refuses
 * `BEGIN`, so transactions go through `storage.transaction`, which includes every `sql.exec` made
 * while its callback runs and rolls back when the callback rejects. Other work waits its turn.
 */
export class DurableSqlite implements SqliteDatabase {
	#storage: DurableObjectStorage;
	#tail: Promise<unknown> = Promise.resolve();

	constructor(storage: DurableObjectStorage) {
		this.#storage = storage;
	}

	#query(sql: string, params: SqliteValue[]) {
		return this.#storage.sql.exec(sql, ...params.map(bind));
	}

	#direct(): SqliteExecutor {
		return {
			exec: async (sql) => void this.#storage.sql.exec(sql),
			run: async (sql, ...params) => void this.#query(sql, params).toArray(),
			get: async <T extends object>(sql: string, ...params: SqliteValue[]) => {
				const [first] = this.#query(sql, params).toArray();
				return first && row<T>(first);
			},
			all: async <T extends object>(sql: string, ...params: SqliteValue[]) =>
				this.#query(sql, params).toArray().map((raw) => row<T>(raw)),
		};
	}

	#serial<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.#tail.then(operation);
		this.#tail = result.catch(() => {});
		return result;
	}

	exec(sql: string): Promise<void> {
		return this.#serial(() => this.#direct().exec(sql));
	}

	run(sql: string, ...params: SqliteValue[]): Promise<void> {
		return this.#serial(() => this.#direct().run(sql, ...params));
	}

	get<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T | undefined> {
		return this.#serial(() => this.#direct().get<T>(sql, ...params));
	}

	all<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T[]> {
		return this.#serial(() => this.#direct().all<T>(sql, ...params));
	}

	transaction<T>(callback: (transaction: SqliteExecutor) => Promise<T>): Promise<T> {
		return this.#serial(() => {
			let active = true;
			const direct = this.#direct();
			const check = () => {
				if (!active) throw new Error("SQLite transaction handle is no longer active");
			};
			const handle: SqliteExecutor = {
				exec: (sql) => (check(), direct.exec(sql)),
				run: (sql, ...params) => (check(), direct.run(sql, ...params)),
				get: (sql, ...params) => (check(), direct.get(sql, ...params)),
				all: (sql, ...params) => (check(), direct.all(sql, ...params)),
			};
			return this.#storage.transaction(() => callback(handle)).finally(() => (active = false));
		});
	}

	async close(): Promise<void> {}
}
