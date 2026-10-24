import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findTodos } from "../src/core/find-todos.ts";

describe("findTodos", () => {
	let testDir: string;

	beforeEach(async () => {
		// Create a temporary directory for testing
		testDir = join(tmpdir(), `find-todos-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		// Clean up test directory
		const { rm } = await import("node:fs/promises");
		await rm(testDir, { recursive: true, force: true });
	});

	it("finds TODO comments in files", async () => {
		// Create test files with TODO comments
		await writeFile(
			join(testDir, "file1.ts"),
			`// This is a test file
// TODO: implement this feature
function test() {
  // TODO: add validation
  return true;
}
`,
		);

		const results = await findTodos(testDir);

		expect(results.items.length).toBeGreaterThan(0);
		expect(results.totalCount).toBeGreaterThanOrEqual(results.items.length);
		const todoItems = results.items.filter((item) => item.text.includes("TODO"));
		expect(todoItems.length).toBeGreaterThan(0);
	});

	it("finds FIXME comments in files", async () => {
		await writeFile(
			join(testDir, "file2.js"),
			`// FIXME: this is broken
function buggyFunction() {
  // FIXME: handle edge case
  return null;
}
`,
		);

		const results = await findTodos(testDir);

		expect(results.items.length).toBeGreaterThan(0);
		const fixmeItems = results.items.filter((item) => item.text.includes("FIXME"));
		expect(fixmeItems.length).toBeGreaterThan(0);
	});

	it("returns empty results when no TODOs found", async () => {
		await writeFile(
			join(testDir, "clean.ts"),
			`// This file has no TODOs
function clean() {
  return true;
}
`,
		);

		const results = await findTodos(testDir);

		expect(results.items).toEqual([]);
		expect(results.totalCount).toBe(0);
	});

	it("caps results at 100 items", async () => {
		// Create a file with many TODO comments
		const lines = [];
		for (let i = 0; i < 150; i++) {
			lines.push(`// TODO: item ${i}`);
		}
		await writeFile(join(testDir, "many-todos.ts"), lines.join("\n"));

		const results = await findTodos(testDir);

		expect(results.items.length).toBeLessThanOrEqual(100);
		expect(results.totalCount).toBeGreaterThanOrEqual(100);
	});

	it("includes file path and line number in results", async () => {
		await writeFile(
			join(testDir, "located.ts"),
			`line 1
// TODO: test item on line 2
line 3
`,
		);

		const results = await findTodos(testDir);

		expect(results.items.length).toBeGreaterThan(0);
		const item = results.items[0];
		expect(item.file).toContain("located.ts");
		expect(item.line).toBeGreaterThan(0);
		expect(item.text).toBeTruthy();
	});
});
