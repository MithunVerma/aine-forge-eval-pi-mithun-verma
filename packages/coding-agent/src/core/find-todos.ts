import { createInterface } from "node:readline";
import { spawn } from "child_process";
import { ensureTool } from "../utils/tools-manager.ts";

export interface TodoItem {
	file: string;
	line: number;
	text: string;
	type: "TODO" | "FIXME";
}

export interface FindTodosResult {
	items: TodoItem[];
	totalCount: number;
	limitReached: boolean;
}

export interface FindTodosOptions {
	cwd: string;
	limit?: number;
	signal?: AbortSignal;
}

const DEFAULT_LIMIT = 100;

/**
 * Find TODO and FIXME comments in the codebase using ripgrep.
 * Returns a list of todo items with file paths, line numbers, and text.
 */
export async function findTodos(options: FindTodosOptions): Promise<FindTodosResult> {
	const { cwd, limit = DEFAULT_LIMIT, signal } = options;

	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		let settled = false;
		const settle = (fn: () => void) => {
			if (!settled) {
				settled = true;
				fn();
			}
		};

		(async () => {
			try {
				const rgPath = await ensureTool("rg");
				if (!rgPath) {
					settle(() => reject(new Error("ripgrep (rg) is not available and could not be downloaded")));
					return;
				}

				// Search for TODO or FIXME with word boundaries
				const pattern = "\\b(TODO|FIXME)\\b";
				const args: string[] = ["--json", "--line-number", "--color=never", "--hidden", "--", pattern, cwd];

				const child = spawn(rgPath, args, { stdio: ["ignore", "pipe", "pipe"] });
				const rl = createInterface({ input: child.stdout });
				let stderr = "";
				let matchCount = 0;
				let totalCount = 0;
				let aborted = false;
				let killedDueToLimit = false;
				const items: TodoItem[] = [];

				const cleanup = () => {
					rl.close();
					signal?.removeEventListener("abort", onAbort);
				};

				const stopChild = (dueToLimit = false) => {
					if (!child.killed) {
						killedDueToLimit = dueToLimit;
						child.kill();
					}
				};

				const onAbort = () => {
					aborted = true;
					stopChild();
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.stderr?.on("data", (chunk) => {
					stderr += chunk.toString();
				});

				rl.on("line", (line) => {
					if (!line.trim()) return;

					let event: any;
					try {
						event = JSON.parse(line);
					} catch {
						return;
					}

					if (event.type === "match") {
						totalCount++;

						if (matchCount < limit) {
							const filePath: string | undefined = event.data?.path?.text;
							const lineNumber: number | undefined = event.data?.line_number;
							const lineText: string | undefined = event.data?.lines?.text;

							if (filePath && typeof lineNumber === "number" && lineText) {
								// Extract the TODO/FIXME type and the comment text
								const match = lineText.match(/\b(TODO|FIXME)\b:?\s*(.*)/);
								const type = (match?.[1] as "TODO" | "FIXME") || "TODO";
								const text = match?.[2]?.trim() || lineText.trim();

								items.push({
									file: filePath,
									line: lineNumber,
									text,
									type,
								});

								matchCount++;
							}
						}

						if (matchCount >= limit) {
							stopChild(true);
						}
					}
				});

				child.on("error", (error) => {
					cleanup();
					settle(() => reject(new Error(`Failed to run ripgrep: ${error.message}`)));
				});

				child.on("close", (code) => {
					cleanup();

					if (aborted) {
						settle(() => reject(new Error("Operation aborted")));
						return;
					}

					if (!killedDueToLimit && code !== 0 && code !== 1) {
						const errorMsg = stderr.trim() || `ripgrep exited with code ${code}`;
						settle(() => reject(new Error(errorMsg)));
						return;
					}

					settle(() =>
						resolve({
							items,
							totalCount,
							limitReached: totalCount > limit,
						}),
					);
				});
			} catch (err) {
				settle(() => reject(err as Error));
			}
		})();
	});
}
