import { spawnProcess, waitForChildProcess } from "../utils/child-process.ts";
import { ensureTool } from "../utils/tools-manager.ts";

export interface TodoItem {
	file: string;
	line: number;
	column: number;
	text: string;
	type: "TODO" | "FIXME";
}

export interface TodoResults {
	items: TodoItem[];
	totalCount: number;
	cappedAt?: number;
}

const MAX_RESULTS = 100;

/**
 * Find TODO and FIXME comments in the codebase using ripgrep.
 * Results are capped at MAX_RESULTS with a count of additional matches.
 */
export async function findTodos(cwd: string, signal?: AbortSignal): Promise<TodoResults> {
	// Ensure ripgrep is available
	await ensureTool("rg");

	const args = [
		"--no-config",
		"--color=never",
		"--no-heading",
		"--line-number",
		"--column",
		"--case-sensitive",
		// Search for TODO or FIXME followed by optional colon/space
		"-e",
		"\\b(TODO|FIXME)\\b",
		"--",
		".",
	];

	const child = spawnProcess("rg", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (signal) {
		signal.addEventListener("abort", () => {
			child.kill("SIGTERM");
		});
	}

	let stdout = "";
	let stderr = "";

	child.stdout?.setEncoding("utf-8");
	child.stderr?.setEncoding("utf-8");

	child.stdout?.on("data", (chunk) => {
		stdout += chunk;
	});

	child.stderr?.on("data", (chunk) => {
		stderr += chunk;
	});

	const exitCode = await waitForChildProcess(child);

	// ripgrep exits with 1 if no matches found (not an error)
	if (exitCode !== 0 && exitCode !== 1) {
		throw new Error(`ripgrep failed with exit code ${exitCode}: ${stderr}`);
	}

	const items: TodoItem[] = [];
	const lines = stdout
		.trim()
		.split("\n")
		.filter((line) => line.length > 0);

	for (const line of lines) {
		// Parse ripgrep output: file:line:column:text
		const match = /^([^:]+):(\d+):(\d+):(.*)$/.exec(line);
		if (!match) continue;

		const [, file, lineStr, columnStr, text] = match;
		const lineNum = Number.parseInt(lineStr, 10);
		const column = Number.parseInt(columnStr, 10);

		// Determine type from the text
		const type = /\bFIXME\b/.test(text) ? "FIXME" : "TODO";

		items.push({
			file,
			line: lineNum,
			column,
			text: text.trim(),
			type,
		});
	}

	const totalCount = items.length;
	const cappedAt = totalCount > MAX_RESULTS ? MAX_RESULTS : undefined;
	const resultItems = cappedAt ? items.slice(0, MAX_RESULTS) : items;

	return {
		items: resultItems,
		totalCount,
		cappedAt,
	};
}
