#!/usr/bin/env node

import getPort from "get-port";
import { Config, defaultConfig, HtmlConfig, PdfConfig } from "./lib/config";
import { HtmlOutput, Output, PdfOutput } from "./lib/generate-output";
import { getDir } from "./lib/helpers";
import { convertMdToPdf, convertMdsToPdfs } from "./lib/md-to-pdf";
import { serveDirectory } from "./lib/serve-dir";

type Input = ContentInput | PathInput | HtmlInput;

interface ContentInput {
	content: string;
}

interface PathInput {
	path: string;
}

interface HtmlInput {
	html: string;
}

const hasContent = (input: Input): input is ContentInput => "content" in input;
const hasPath = (input: Input): input is PathInput => "path" in input;
const hasHtml = (input: Input): input is HtmlInput => "html" in input;

/**
 * Convert a markdown file to PDF.
 */
export async function mdToPdf(
	input: ContentInput | PathInput | HtmlInput,
	config?: Partial<PdfConfig>,
): Promise<PdfOutput>;
export async function mdToPdf(
	input: ContentInput | PathInput | HtmlInput,
	config?: Partial<HtmlConfig>,
): Promise<HtmlOutput>;
export async function mdToPdf(
	input: Input,
	config: Partial<Config> = {},
): Promise<Output> {
	if (!hasContent(input) && !hasPath(input) && !hasHtml(input)) {
		throw new Error(
			'The input is missing one of the properties "content" or "path" or "html".',
		);
	}

	if (!config.port) {
		config.port = await getPort();
	}

	if (!config.basedir) {
		config.basedir = "path" in input ? getDir(input.path) : process.cwd();
	}

	if (!config.dest) {
		config.dest = "";
	}

	const mergedConfig: Config = {
		...defaultConfig,
		...config,
		pdf_options: { ...defaultConfig.pdf_options, ...config.pdf_options },
	};

	const server = await serveDirectory(config.basedir, config.port);

	const pdf = await convertMdToPdf(input, mergedConfig);

	server.close();

	return pdf;
}

/**
 * Convert a markdown file to PDF.
 */
export async function mdsToPdfs(
	params: {
		input: ContentInput | PathInput | HtmlInput,
		config?: Partial<PdfConfig>,
	}[],
	options: {
		port?: number,
		basedir?: string;
	}
): Promise<PdfOutput[]>;
export async function mdsToPdfs(
	params: {
		input: ContentInput | PathInput | HtmlInput,
		config?: Partial<HtmlConfig>,
	}[],
	options: {
		port?: number,
		basedir?: string;
	}
): Promise<HtmlOutput[]>;
export async function mdsToPdfs(
	params: {
		input: Input,
		config?: Partial<Config>,
	}[],
	options: {
		port?: number,
		basedir?: string;
	}
): Promise<Output[]> {
	params.forEach(param => {
		const input = param.input;
		if (!hasContent(input) && !hasPath(input) && !hasHtml(input)) {
			throw new Error(
				'The input is missing one of the properties "content" or "path" or "html".',
			);
		}
	});
	let port = options.port;
	if (!port) {
		port = await getPort();
	}

	let basedir: any = options.basedir;

	const data = params.map(param => {
		const { input, config = {} } = param;
		if (!basedir) {
			basedir = config.basedir;
			if (!basedir) {
				basedir = "path" in input ? getDir(input.path) : process.cwd();
			}
		}
		if (!config.dest) {
			config.dest = "";
		}
		const mergedConfig: Config = {
			...defaultConfig,
			...config,
			port,
			pdf_options: { ...defaultConfig.pdf_options, ...config.pdf_options },
		};
		return {
			input,
			config: mergedConfig
		}
	})

	const server = await serveDirectory(basedir, port);

	const result = await convertMdsToPdfs(data);

	server.close();

	return result as Output[];
}

export default mdToPdf;

export interface PackageJson {
	engines: {
		node: string;
	};
	version: string;
}
