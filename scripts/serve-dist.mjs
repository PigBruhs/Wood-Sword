import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { exec } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const rootDir = resolve(process.cwd(), args.root ?? "dist");
const host = args.host ?? "127.0.0.1";
const requestedPort = Number(args.port ?? 4173);
const maxPortTries = Number(args.maxPortTries ?? 20);

if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
  console.error(`Static root not found: ${rootDir}`);
  process.exit(1);
}

startServer(requestedPort, maxPortTries);

function startServer(startPort, remainingTries) {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const rawPath = requestPath === "/" ? "/index.html" : requestPath;
    const normalizedPath = normalize(rawPath).replace(/^([.][.][/\\])+/, "");
    const filePath = join(rootDir, normalizedPath);

    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const contentType = mimeTypeFor(extname(filePath));
    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  });

  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE" && remainingTries > 0) {
      const nextPort = startPort + 1;
      console.warn(`Port ${startPort} is in use, retrying on ${nextPort}...`);
      startServer(nextPort, remainingTries - 1);
      return;
    }

    if (err?.code === "EADDRINUSE") {
      console.error(`No free port found after trying ${maxPortTries + 1} ports starting at ${requestedPort}.`);
    } else {
      console.error(`Server failed: ${err.message}`);
    }
    process.exit(1);
  });

  server.listen(startPort, host, () => {
    const address = server.address();
    const activePort = typeof address === "object" && address ? address.port : startPort;
    const url = `http://${host}:${activePort}`;
    if (activePort !== requestedPort) {
      console.log(`Wood-Sword running at ${url} (requested ${requestedPort})`);
    } else {
      console.log(`Wood-Sword running at ${url}`);
    }
    openBrowser(url);
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

function openBrowser(url) {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
    return;
  }
  if (process.platform === "darwin") {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

function mimeTypeFor(ext) {
  switch (ext.toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}
