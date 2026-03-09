const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const { searchLiterature } = require("./src/research-service");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const absolutePath = path.join(PUBLIC_DIR, safePath);

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const fileBuffer = await fs.readFile(absolutePath);
    const fileExtension = path.extname(absolutePath);

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[fileExtension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(fileBuffer);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "File not found" });
      return;
    }

    console.error(error);
    sendJson(response, 500, { error: "Static file error" });
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

  if (request.method === "POST" && requestUrl.pathname === "/api/search") {
    try {
      const payload = await readRequestBody(request);
      const result = await searchLiterature(payload);
      sendJson(response, 200, result);
    } catch (error) {
      console.error(error);
      sendJson(response, 400, {
        error: error.message || "Search failed"
      });
    }
    return;
  }

  if (request.method === "GET") {
    await serveStaticFile(requestUrl.pathname, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(PORT, HOST, () => {
  console.log(`Literature scout running at http://${HOST}:${PORT}`);
});
