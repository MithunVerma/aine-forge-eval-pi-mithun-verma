import { describe, expect, test } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../../../src/core/slash-commands.ts";

describe("/todos slash command registration", () => {
	test("todos is registered as a builtin slash command", () => {
		const todosCommand = BUILTIN_SLASH_COMMANDS.find((cmd) => cmd.name === "todos");
		expect(todosCommand).toBeDefined();
		expect(todosCommand?.description).toContain("TODO");
	});

	test("todos command has correct description", () => {
		const todosCommand = BUILTIN_SLASH_COMMANDS.find((cmd) => cmd.name === "todos");
		expect(todosCommand?.description).toBe("Show TODO and FIXME comments in the codebase");
	});
});
