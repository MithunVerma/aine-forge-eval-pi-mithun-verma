/**
 * Todos Search Extension
 *
 * Adds a /todos slash command that searches the codebase for TODO, FIXME, XXX, HACK, and NOTE comments.
 *
 * Usage:
 *   pi -e ./todos-search.ts
 *   /todos
 *   /todos <directory>
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureTool } from "../../src/utils/tools-manager.ts";

interface TodoMatch {
	file: string;
	line: number;
	type: string;
	message: string;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("todos", {
		description: "Search for TODO, FIXME, XXX, HACK, and NOTE comments in the codebase",
		arguments: [
			{
				name: "path",
				description: "Directory to search (default: current directory)",
				required: false,
			},
		],
		async handler(rawArgs, _ctx) {
			const searchPath = rawArgs.trim() || ".";
			const cwd = process.cwd();

			try {
				// Ensure ripgrep is available
				const rgPath = await ensureTool("rg");
				if (!rgPath) {
					pi.sendMessage({
						customType: "todos-result",
						content: "Error: ripgrep (rg) is not available and could not be downloaded",
						display: true,
					});
					return;
				}

				// Search for common TODO patterns
				// Pattern matches: TODO, FIXME, XXX, HACK, NOTE with optional colon and following text
				const pattern = "(TODO|FIXME|XXX|HACK|NOTE):?\\s*(.*)";

				const rgArgs = [
					"--no-heading", // Don't print file headers
					"--line-number", // Show line numbers
					"--color",
					"never", // No color codes
					"--case-sensitive", // Case sensitive
					"--type-not",
					"lock", // Ignore lock files
					"--glob",
					"!package-lock.json", // Ignore package-lock.json
					"--glob",
					"!*.min.js", // Ignore minified files
					"--glob",
					"!*.min.css", // Ignore minified CSS
					pattern,
					searchPath,
				];

				const todos: TodoMatch[] = [];
				let stderr = "";

				const child = spawn(rgPath, rgArgs, { stdio: ["ignore", "pipe", "pipe"], cwd });

				child.stdout.on("data", (data: Buffer) => {
					const lines = data.toString().split("\n");
					for (const line of lines) {
						if (!line.trim()) continue;

						// Parse ripgrep output: file:line:content
						const match = line.match(/^([^:]+):(\d+):(.+)$/);
						if (match) {
							const [, file, lineNum, content] = match;

							// Extract the TODO type and message
							const todoMatch = content.match(/(TODO|FIXME|XXX|HACK|NOTE):?\s*(.*)/);
							if (todoMatch) {
								const [, type, message] = todoMatch;
								todos.push({
									file,
									line: Number.parseInt(lineNum, 10),
									type,
									message: message.trim() || "(no description)",
								});
							}
						}
					}
				});

				child.stderr.on("data", (data: Buffer) => {
					stderr += data.toString();
				});

				await new Promise<void>((resolve, reject) => {
					child.on("close", (code) => {
						// ripgrep exits with code 1 if no matches found, which is not an error for us
						if (code === 0 || code === 1) {
							resolve();
						} else {
							reject(new Error(`ripgrep exited with code ${code}: ${stderr}`));
						}
					});

					child.on("error", (error) => {
						reject(error);
					});
				});

				// Format and display results
				if (todos.length === 0) {
					pi.sendMessage({
						customType: "todos-result",
						content: `No TODOs found in ${searchPath}`,
						display: true,
					});
					return;
				}

				// Group by type
				const byType = new Map<string, TodoMatch[]>();
				for (const todo of todos) {
					const list = byType.get(todo.type) || [];
					list.push(todo);
					byType.set(todo.type, list);
				}

				// Build output
				let output = `Found ${todos.length} TODO${todos.length === 1 ? "" : "s"} in ${searchPath}:\n\n`;

				// Sort types by priority
				const typeOrder = ["FIXME", "XXX", "HACK", "TODO", "NOTE"];
				const sortedTypes = Array.from(byType.keys()).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));

				for (const type of sortedTypes) {
					const items = byType.get(type);
					if (!items) continue;

					output += `## ${type} (${items.length})\n\n`;

					for (const item of items) {
						output += `- \`${item.file}:${item.line}\` - ${item.message}\n`;
					}

					output += "\n";
				}

				pi.sendMessage({
					customType: "todos-result",
					content: output,
					display: true,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				pi.sendMessage({
					customType: "todos-result",
					content: `Error searching for TODOs: ${message}`,
					display: true,
				});
			}
		},
	});
}
