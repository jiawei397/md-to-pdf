import puppeteer from "puppeteer";
import { Config, HtmlConfig, PdfConfig } from "./config";
import { isHttpUrl } from "./is-http-url";

export type Output = PdfOutput | HtmlOutput;

export interface PdfOutput extends BasicOutput {
	content: Buffer;
}

export interface HtmlOutput extends BasicOutput {
	content: string;
}

interface BasicOutput {
	filename: string | undefined;
}

/**
 * Generate the output (either PDF or HTML).
 */
export async function generateOutput(
	html: string,
	relativePath: string,
	config: PdfConfig,
): Promise<PdfOutput>;
export async function generateOutput(
	html: string,
	relativePath: string,
	config: HtmlConfig,
): Promise<HtmlOutput>;
export async function generateOutput(
	html: string,
	relativePath: string,
	config: Config,
): Promise<Output>;
export async function generateOutput(
	html: string,
	relativePath: string,
	config: Config,
): Promise<Output> {
	const browser = await puppeteer.launch({
		devtools: config.devtools,
		...config.launch_options,
	});

	const page = await browser.newPage();

	const outputFileContent = await makeContent(
		page,
		html,
		relativePath,
		config,
	);

	await browser.close();

	return config.devtools
		? (undefined as any)
		: { filename: config.dest, content: outputFileContent };
}

async function makeContent(
	page: any,
	html: string,
	relativePath: string,
	config: Config,
) {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	await page.goto(`http://localhost:${config.port!}${relativePath}`); // make sure relative paths work as expected
	await page.setContent(html); // overwrite the page content with what was generated from the markdown

	let index = 0;
	for (const stylesheet of config.stylesheet) {
		if (index === 0) {
			index++;
			// 如果是纯粹的html，不需要markdown的样式
			if (config.isHtml) {
				continue;
			}
		}
		await page.addStyleTag(
			isHttpUrl(stylesheet) ? { url: stylesheet } : { path: stylesheet },
		);
	}

	if (config.css) {
		await page.addStyleTag({ content: config.css });
	}

	for (const scriptTagOptions of config.script) {
		await page.addScriptTag(scriptTagOptions);
	}

	/**
	 * Trick to wait for network to be idle.
	 *
	 * @todo replace with page.waitForNetworkIdle once exposed
	 * @see https://github.com/GoogleChrome/puppeteer/issues/3083
	 */
	await Promise.all([
		page.waitForNavigation({ waitUntil: "networkidle0" }),
		page.evaluate(() =>
			history.pushState(undefined, "", "#")
		), /* eslint no-undef: off */
	]);

	let outputFileContent: string | Buffer = "";

	if (config.devtools) {
		await new Promise((resolve) => page.on("close", resolve));
	} else if (config.as_html) {
		outputFileContent = await page.content();
	} else {
		await page.emulateMediaType(config.page_media_type);
		outputFileContent = await page.pdf(config.pdf_options);
	}

	return outputFileContent;
}

export interface GenerateOutputParam {
	html: string;
	dest?: string;
}

export async function generateOutputs(
	params: GenerateOutputParam[],
	relativePath: string,
	config: PdfConfig | HtmlConfig | Config
): Promise<Output[]> {
	const browser = await puppeteer.launch({
		devtools: config.devtools,
		...config.launch_options,
	});

	const page = await browser.newPage();

	const results = [];

	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		if (!param) {
			continue;
		}
		const outputFileContent = await makeContent(
			page,
			param.html,
			relativePath,
			param.dest
				? {
					...config,
					dest: param.dest,
				}
				: config,
		);
		results.push(config.devtools ? (undefined as any) : {
			filename: param.dest ?? config.dest,
			content: outputFileContent,
		});
	}

	await browser.close();
	return results;
}
