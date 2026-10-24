/**
 * Todos Extension
 *
 * Exposes /todos [pathspec...] to list TODO and FIXME comments in tracked files.
 * Uses `git grep`, so untracked, ignored, and binary files are skipped.
 * Selecting an entry puts its `path:line` reference into the editor.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MARKERS = ["TODO", "FIXME"];
const MAX_ENTRIES = 500;
const MAX_TEXT_LENGTH = 160;

export interface TodoEntry {
	file: string;
	line: number;
	text: string;
}

/** Parse `git grep -n` output lines of the form `path:line:text`. */
export function parseTodoLines(output: string): TodoEntry[] {
	const entries: TodoEntry[] = [];
	for (const raw of output.split("\n")) {
		const match = /^(.+?):(\d+):(.*)$/.exec(raw);
		if (!match) continue;
		let text = match[3].trim();
		if (text.length > MAX_TEXT_LENGTH) text = `${text.slice(0, MAX_TEXT_LENGTH - 3)}...`;
		entries.push({ file: match[1], line: Number(match[2]), text });
	}
	return entries;
}

export function formatTodoEntry(entry: TodoEntry): string {
	return `${entry.file}:${entry.line}  ${entry.text}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("todos", {
		description: "List TODO/FIXME comments in tracked files (optional pathspec)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;

			const pathspecs = args.trim().split(/\s+/).filter(Boolean);
			const grepArgs = ["grep", "-n", "-I", "-w", ...MARKERS.flatMap((m) => ["-e", m])];
			if (pathspecs.length > 0) grepArgs.push("--", ...pathspecs);

			const result = await pi.exec("git", grepArgs, { cwd: ctx.cwd, timeout: 30_000 });
			// git grep exits with 1 when nothing matches.
			if (result.code === 1 && result.stderr.trim() === "") {
				ctx.ui.notify("No TODO or FIXME comments found", "info");
				return;
			}
			if (result.code !== 0) {
				ctx.ui.notify(`git grep failed: ${result.stderr.trim() || `exit code ${result.code}`}`, "error");
				return;
			}

			const entries = parseTodoLines(result.stdout);
			const shown = entries.slice(0, MAX_ENTRIES);
			const capped = entries.length > shown.length ? ` (showing first ${shown.length})` : "";
			const options = shown.map(formatTodoEntry);
			const choice = await ctx.ui.select(`${entries.length} TODO/FIXME comments${capped}`, options);
			if (choice === undefined) return;

			const entry = shown[options.indexOf(choice)];
			if (!entry) return;
			const current = ctx.ui.getEditorText();
			const reference = `${entry.file}:${entry.line}`;
			ctx.ui.setEditorText(current ? `${current} ${reference}` : `${reference} `);
		},
	});
}
