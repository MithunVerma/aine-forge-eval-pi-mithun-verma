import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findTodos } from "../src/core/find-todos.ts";

describe("findTodos", () => {
	let testDir: string;

	beforeEach(async () => {
		// Create a temporary test directory
		testDir = await mkdtemp(join(tmpdir(), "todos-test-"));
	});

	afterEach(async () => {
		// Clean up the test directory
		await rm(testDir, { recursive: true, force: true });
	});

	test("finds TODO and FIXME comments in files", async () => {
		// Create test files with TODO and FIXME comments
		await writeFile(
			join(testDir, "file1.ts"),
			`
// TODO: Implement this feature
function foo() {
  return "bar";
}
`,
		);
		await writeFile(
			join(testDir, "file2.js"),
			`
// FIXME: This is broken
function baz() {
  return "qux";
}
`,
		);

		const result = await findTodos({ cwd: testDir });

		expect(result.items).toHaveLength(2);
		expect(result.totalCount).toBe(2);
		expect(result.limitReached).toBe(false);

		const todo = result.items.find((item) => item.text.includes("TODO"));
		expect(todo).toBeDefined();
		expect(todo?.file).toMatch(/file1\.ts$/);
		expect(todo?.line).toBe(2);
		expect(todo?.text).toContain("Implement this feature");

		const fixme = result.items.find((item) => item.text.includes("FIXME"));
		expect(fixme).toBeDefined();
		expect(fixme?.file).toMatch(/file2\.js$/);
		expect(fixme?.line).toBe(2);
		expect(fixme?.text).toContain("This is broken");
	});

	test("respects limit parameter", async () => {
		// Create multiple files with TODO comments
		for (let i = 0; i < 5; i++) {
			await writeFile(
				join(testDir, `file${i}.ts`),
				`
// TODO: Task ${i}
function task${i}() {}
`,
			);
		}

		const result = await findTodos({ cwd: testDir, limit: 3 });

		expect(result.items).toHaveLength(3);
		expect(result.totalCount).toBe(5);
		expect(result.limitReached).toBe(true);
	});

	test("returns empty result when no TODOs found", async () => {
		await writeFile(
			join(testDir, "clean.ts"),
			`
function clean() {
  return "no todos here";
}
`,
		);

		const result = await findTodos({ cwd: testDir });

		expect(result.items).toHaveLength(0);
		expect(result.totalCount).toBe(0);
		expect(result.limitReached).toBe(false);
	});

	test("handles word boundaries correctly", async () => {
		await writeFile(
			join(testDir, "boundaries.ts"),
			`
// TODO: Real todo
const TODOLIST = "not a todo";
// This FIXME is real
const FIXMEUP = "not a fixme";
`,
		);

		const result = await findTodos({ cwd: testDir });

		// Should only find the real TODO and FIXME, not the ones in variable names
		expect(result.items).toHaveLength(2);
		expect(result.items.every((item) => item.text.includes("Real") || item.text.includes("This"))).toBe(
			true,
		);
	});

	test("searches hidden files", async () => {
		await writeFile(
			join(testDir, ".hidden.ts"),
			`
// TODO: Hidden file todo
`,
		);

		const result = await findTodos({ cwd: testDir });

		expect(result.items).toHaveLength(1);
		expect(result.items[0].file).toMatch(/\.hidden\.ts$/);
	});
});
