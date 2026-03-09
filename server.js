const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "index.html" : requestPath.replace(/^[/\\]+/, "");
  const absolutePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    console.error(error);
    sendJson(response, 500, { error: "Static file error" });
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  await serveStaticFile(new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`).pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Literature Discovery preview running at http://${HOST}:${PORT}`);
});
