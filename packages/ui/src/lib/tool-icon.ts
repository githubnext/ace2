import type { ComponentType } from "react";
import {
	IconBolt,
	IconBot,
	IconBrain,
	IconChecklist,
	IconCommand,
	IconEye,
	IconFileSearch,
	IconFolderSearch,
	IconGlobe,
	IconImage,
	IconPencil,
	IconSearch,
	IconTerminal,
	IconWrench,
} from "../icons";

type Icon = ComponentType<{ className?: string; size?: number | string }>;

const EDIT = IconPencil;
const SHELL = IconTerminal;
const VIEW = IconEye;
const READ = IconFileSearch;
const FIND = IconFolderSearch;
const SEARCH = IconSearch;
const TASKS = IconChecklist;
const AGENT = IconBot;
const WEB = IconGlobe;
const TOOLS = IconWrench;
const COMMAND = IconCommand;
const IMAGE = IconImage;
const THINK = IconBrain;
const DEFAULT: Icon = IconBolt;

const MAP: Record<string, Icon> = {
	edit: EDIT,
	editfile: EDIT,
	write: EDIT,
	writefile: EDIT,
	create: EDIT,
	createfile: EDIT,
	notebookedit: EDIT,
	strreplace: EDIT,
	strreplaceeditor: EDIT,
	replace: EDIT,
	update: EDIT,
	patch: EDIT,
	applypatch: EDIT,
	applydiff: EDIT,

	bash: SHELL,
	powershell: SHELL,
	localshell: SHELL,
	readbash: SHELL,
	writebash: SHELL,
	stopbash: SHELL,
	listbash: SHELL,
	readpowershell: SHELL,
	writepowershell: SHELL,
	stoppowershell: SHELL,
	listpowershell: SHELL,
	shell: SHELL,
	exec: SHELL,
	execute: SHELL,
	run: SHELL,
	terminal: SHELL,

	read: READ,
	readfile: READ,
	view: VIEW,
	viewfile: VIEW,
	viewimage: IMAGE,
	reasoning: THINK,
	cat: READ,
	open: READ,

	glob: FIND,
	find: FIND,
	list: FIND,
	ls: FIND,
	listfiles: FIND,
	findfiles: FIND,

	grep: SEARCH,
	search: SEARCH,
	ripgrep: SEARCH,

	task: TASKS,
	tasks: TASKS,
	taskcreate: TASKS,
	taskupdate: TASKS,
	tasklist: TASKS,
	taskget: TASKS,
	taskstop: TASKS,
	taskoutput: TASKS,
	taskcomplete: TASKS,
	todo: TASKS,
	todowrite: TASKS,
	todoread: TASKS,
	updatetodo: TASKS,
	reportprogress: TASKS,
	exitplanmode: TASKS,
	manageschedule: TASKS,
	parallelvalidation: TASKS,

	agent: AGENT,
	agents: AGENT,
	readagent: AGENT,
	writeagent: AGENT,
	listagents: AGENT,
	generalpurpose: AGENT,
	explore: AGENT,
	plan: AGENT,
	subagent: AGENT,

	webfetch: WEB,
	websearch: WEB,
	fetch: WEB,
	browse: WEB,
	url: WEB,
	curl: WEB,

	toolsearch: TOOLS,
	toolsearchtoolregex: TOOLS,
	tool: TOOLS,
	mcp: TOOLS,
	contextboard: TOOLS,
	storememory: TOOLS,
	votememory: TOOLS,
	injectmemories: TOOLS,
	readinbox: TOOLS,
	sendinbox: TOOLS,
	askuser: TOOLS,
	ghadvisorydatabase: TOOLS,
	codeqlchecker: TOOLS,
	secretscanning: TOOLS,
	dependabotchecker: TOOLS,
	sql: TOOLS,
	sessionstoresql: TOOLS,
	lsp: TOOLS,
	searchcodesubagent: TOOLS,
	searchagent: TOOLS,

	command: COMMAND,
	slashcommand: COMMAND,
	skill: COMMAND,
	createpullrequest: COMMAND,
	replytocomment: COMMAND,
	codereview: COMMAND,
};

/**
 * Return the icon component for a tool name, matching common coding-agent
 * tool identifiers (Edit, Bash, Read, Grep, etc.) across snake_case,
 * PascalCase, and kebab-case spellings. Falls back to a bolt icon.
 */
function iconFor(name: string): Icon {
	let key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (MAP[key]) return MAP[key];
	if (key.includes("mcp")) return TOOLS;
	return DEFAULT;
}

export { iconFor };
export type { Icon };
