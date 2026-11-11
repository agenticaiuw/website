// Agent Skills (https://agentskills.io): folders with a SKILL.md whose YAML
// frontmatter gives a name and description, followed by instructions, plus
// optional scripts/, references/ and assets/. The bot sees every installed
// skill's name and description, and loads one's instructions when it's needed.

export interface AgentSkill {
	/** Folder name under /workspace/skills. */
	dir: string;
	name: string;
	description: string;
	/** SKILL.md without its frontmatter. */
	body: string;
	files: string[];
}

const MAX_DESCRIPTION_CHARS = 1_024;

/** Reads the simple YAML used in SKILL.md frontmatter: scalars, quoted strings and | or > blocks. */
export function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } {
	const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	if (!match) return { fields: {}, body: text };
	const fields: Record<string, string> = {};
	const lines = match[1].split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
		if (!field) continue;
		let value = field[2].trim();
		if (/^[|>][+-]?$/.test(value)) {
			const block: string[] = [];
			while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === "")) block.push(lines[++i].trim());
			value = value.startsWith("|") ? block.join("\n").trim() : block.join(" ").replace(/\s+/g, " ").trim();
		} else if (/^(["']).*\1$/.test(value)) {
			value = value.slice(1, -1);
		}
		fields[field[1]] = value;
	}
	return { fields, body: text.slice(match[0].length).trim() };
}

/** Parses the listing saveWorkspace prints: "===SKILL dir", SKILL.md, "===FILES", file paths. */
export function parseSkills(listing: string): AgentSkill[] {
	return listing
		.split(/^===SKILL /m)
		.slice(1)
		.map((chunk) => {
			const dir = chunk.slice(0, chunk.indexOf("\n")).trim();
			const rest = chunk.slice(chunk.indexOf("\n") + 1);
			const [skillMd, files = ""] = rest.split(/^===FILES$/m);
			const { fields, body } = parseFrontmatter(skillMd.trim());
			return {
				dir,
				name: fields.name || dir,
				description: (fields.description || "").slice(0, MAX_DESCRIPTION_CHARS),
				body,
				files: files.split("\n").map((f) => f.trim()).filter(Boolean),
			};
		})
		.filter((skill) => skill.dir);
}
