import { createServer, Server } from "http";
import serveHandler from "serve-handler";

let serverPromise: Promise<any> | null;
let serverCount = 0;
/**
 * Serve a directory on a random port using a HTTP server and the serve-handler package.
 *
 * @returns a promise that resolves with the server instance once the server is ready and listening.
 */
export const serveDirectory = async (basedir: string, port: number) => {
	serverCount++;
	if (serverPromise) {
		return serverPromise;
	}
	serverPromise = new Promise<Server>((resolve) => {
		const server = createServer(async (request, response) =>
			serveHandler(request, response, { public: basedir })
		);

		server.listen(port, () => resolve(server));
	});
	return serverPromise;
};

/**
 * Close the given server instance asynchronously.
 */
export const closeServer = async (server: Server) => {
	if (serverCount > 1) {
		serverCount--;
		return;
	}
	serverPromise = null;
	serverCount = 0;
	return new Promise((resolve) => server.close(resolve));
};
