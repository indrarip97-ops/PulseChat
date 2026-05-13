const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "pulsechat-data.json");
const MAX_BODY_BYTES = 35 * 1024 * 1024;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function emptyState() {
  return {
    users: [],
    messages: [],
    friendRequests: [],
  };
}

async function readState() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return emptyState();
    }
    throw error;
  }
}

async function writeState(nextState) {
  const safeState = {
    users: Array.isArray(nextState.users) ? nextState.users : [],
    messages: Array.isArray(nextState.messages) ? nextState.messages : [],
    friendRequests: Array.isArray(nextState.friendRequests) ? nextState.friendRequests : [],
  };
  await fs.writeFile(DATA_FILE, JSON.stringify(safeState, null, 2), "utf8");
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function handleApi(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, await readState());
    return;
  }

  if (request.method === "PUT") {
    const raw = await readBody(request);
    await writeState(JSON.parse(raw || "{}"));
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

async function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, normalizedPath);
  const relativePath = path.relative(ROOT, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

  Promise.resolve()
    .then(() => {
      if (url.pathname === "/api/state") {
        return handleApi(request, response);
      }
      return serveStatic(request, response, url.pathname);
    })
    .catch((error) => {
      console.error(error);
      if (!response.headersSent) {
        sendJson(response, 500, { error: "Server error" });
      } else {
        response.end();
      }
    });
});

server.listen(PORT, HOST, () => {
  console.log(`PulseChat running at http://${HOST}:${PORT}`);
});
