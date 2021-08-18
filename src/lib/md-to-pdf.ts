import { promises as fs } from "fs";
import grayMatter from "gray-matter";
import { dirname, resolve } from "path";
import { Config } from "./config";
import { generateOutput, GenerateOutputParam, generateOutputs } from "./generate-output";
import { getHtml } from "./get-html";
import { getOutputFilePath } from "./get-output-file-path";
import { getMarginObject } from "./helpers";
import { readFile } from "./read-file";

type CliArgs = typeof import("../cli").cliFlags;

type Input = { path: string } | { content: string } | { html: string };

/**
 * Convert html to pdf.
 */
const convertHtmlToPdf = async (
	html: string,
	input: Input,
	config: Config,
) => {
	const relativePath = "path" in input
		? resolve(input.path).replace(config.basedir, "")
		: "/";

	const output = await generateOutput(html, relativePath, config);

	if (!output) {
		if (config.devtools) {
			throw new Error("No file is generated with --devtools.");
		}

		throw new Error(`Failed to create ${config.as_html ? "HTML" : "PDF"}.`);
	}

	if (output.filename) {
		if (output.filename === "stdout") {
			process.stdout.write(output.content);
		} else {
			await fs.writeFile(output.filename, output.content);
		}
	}

	return output;
};

/**
 * Convert htmls to pdf.
 */
const convertHtmlsToPdf = async (
	htmls: GenerateOutputParam[],
	input: Input,
	config: Config,
) => {
	const relativePath = "path" in input
		? resolve(input.path).replace(config.basedir, "")
		: "/";

	const outputs = await generateOutputs(htmls.map((param => {
		return {
			html: param.html,
			dest: param.dest,
		}
	})), relativePath, config);

	if (!outputs) {
		if (config.devtools) {
			throw new Error("No file is generated with --devtools.");
		}

		throw new Error(`Failed to create ${config.as_html ? "HTML" : "PDF"}.`);
	}

	Promise.all(outputs.map(async output => {
		if (output.filename) {
			if (output.filename === "stdout") {
				process.stdout.write(output.content);
			} else {
				await fs.writeFile(output.filename, output.content);
			}
		}
	}));
	return outputs;
};

/**
 * Convert markdown to html.
 */
export const convertMdToHtml = async (
	input: Input,
	config: Config,
	args: CliArgs = {} as CliArgs,
) => {
	let md = "";
	let frontMatterConfig: any = {};
	if ("html" in input) {
	} else {
		const mdFileContent = "content" in input ? input.content : await readFile(
			input.path,
			args["--md-file-encoding"] ?? config.md_file_encoding,
		);

		const { content, data } = grayMatter(mdFileContent);
		md = content;
		frontMatterConfig = data;
	}

	// merge front-matter config
	config = {
		...config,
		...(frontMatterConfig as Config),
		pdf_options: {
			...config.pdf_options,
			...(frontMatterConfig.pdf_options || {}),
		},
	};

	const { headerTemplate, footerTemplate, displayHeaderFooter } =
		config.pdf_options;

	if ((headerTemplate || footerTemplate) && displayHeaderFooter === undefined) {
		config.pdf_options.displayHeaderFooter = true;
	}

	const arrayOptions = ["body_class", "script", "stylesheet"] as const;

	// sanitize frontmatter array options
	for (const option of arrayOptions) {
		if (!Array.isArray(config[option])) {
			config[option] = [config[option]].filter(Boolean) as any;
		}
	}

	const jsonArgs = new Set([
		"--marked-options",
		"--pdf-options",
		"--launch-options",
	]);

	// merge cli args into config
	for (const arg of Object.entries(args)) {
		const [argKey, argValue] = arg as [string, string];
		const key = argKey.slice(2).replace(/-/g, "_");

		(config as Record<string, any>)[key] = jsonArgs.has(argKey)
			? JSON.parse(argValue)
			: argValue;
	}

	// sanitize the margin in pdf_options
	if (typeof config.pdf_options.margin === "string") {
		config.pdf_options.margin = getMarginObject(config.pdf_options.margin);
	}

	// set output destination
	if (config.dest === undefined) {
		config.dest = "path" in input
			? getOutputFilePath(input.path, config.as_html ? "html" : "pdf")
			: "stdout";
	}

	const highlightStylesheet = resolve(
		dirname(require.resolve("highlight.js")),
		"..",
		"styles",
		`${config.highlight_style}.css`,
	);

	config.stylesheet = [...new Set([...config.stylesheet, highlightStylesheet])];

	let html;
	if ("html" in input) {
		html = input.html;
	} else {
		html = getHtml(md, config);
	}

	return {
		html,
		config,
	};
};

/**
 * Convert markdown to pdf.
 */
export const convertMdToPdf = async (
	input: Input,
	config: Config,
	args: CliArgs = {} as CliArgs,
) => {
	const { html, config: mergedConfig } = await convertMdToHtml(
		input,
		config,
		args,
	);

	return convertHtmlToPdf(html, input, mergedConfig);
};

/**
 * Convert markdowns to pdfs.
 */
export const convertMdsToPdfs = async (
	params: {
		input: Input,
		config: Config,
		args?: CliArgs,
	}[],
) => {
	if (params.length === 0) {
		return;
	}
	let newConfig: Config;
	let input: Input;
	const htmls = await Promise.all(params.map(async (param) => {
		const args = param.args || {} as CliArgs;
		const { html, config: mergedConfig } = await convertMdToHtml(
			param.input,
			param.config,
			args
		);
		newConfig = mergedConfig;
		input = param.input;
		return {
			html,
			dest: param.config.dest,
			args
		};
	}));

	return convertHtmlsToPdf(htmls, input!, newConfig!);
};
