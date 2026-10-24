/**
 * Component for displaying TODO and FIXME search results.
 */

import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { TodoResults } from "../../../core/find-todos.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyText } from "./keybinding-hints.ts";

export class TodosListComponent extends Container {
	constructor(results: TodoResults) {
		super();

		const borderColor = (str: string) => theme.fg("accent", str);

		// Add spacer
		this.addChild(new Spacer(1));

		// Top border
		this.addChild(new DynamicBorder(borderColor));

		// Content
		const contentContainer = new Container();

		// Header
		const additionalCount = results.totalCount - results.items.length;
		const totalCount = results.totalCount;
		const headerText = `Found ${totalCount} TODO/FIXME comment${totalCount === 1 ? "" : "s"}`;
		contentContainer.addChild(new Text(theme.fg("accent", headerText)));

		if (results.items.length === 0) {
			contentContainer.addChild(new Text(theme.fg("muted", "No TODO or FIXME comments found")));
		} else {
			// Show results
			for (const item of results.items) {
				const location = `${item.file}:${item.line}`;
				contentContainer.addChild(new Text(theme.fg("muted", location)));
				contentContainer.addChild(new Text(`  ${item.text}`));
			}

			// Show additional count if truncated
			if (additionalCount > 0) {
				contentContainer.addChild(new Spacer(1));
				contentContainer.addChild(new Text(theme.fg("muted", `…and ${additionalCount} more`)));
			}
		}

		contentContainer.addChild(new Spacer(1));
		contentContainer.addChild(new Text(theme.fg("muted", `Press ${keyText("tui.select.cancel")} to close`)));

		this.addChild(contentContainer);

		// Bottom border
		this.addChild(new DynamicBorder(borderColor));
	}
}
