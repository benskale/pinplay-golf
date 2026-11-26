import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // SEO/AI files that must not fall through to the SPA catch-all
  app.get("/sitemap.xml", (_req, res) => {
    res.type("application/xml").send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      '  <url><loc>https://pinplay.golf/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n' +
      '</urlset>'
    );
  });
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      "User-agent: *\nAllow: /\n\nSitemap: https://pinplay.golf/sitemap.xml\n"
    );
  });
  app.get("/llms.txt", (_req, res) => {
    res.type("text/plain").send(
      "# PinPlay Golf\n\n" +
      "Real-time multiplayer golf scoring app for 23 game formats: Wolf, Skins, Nassau, Match Play, Stableford, Vegas and more.\n\n" +
      "- [Home](https://pinplay.golf/): start or join a game with a code.\n" +
      "- [Tournament view](https://pinplay.golf/tournament/): public live-score pages for events.\n" +
      "- [Join a game](https://pinplay.golf/join/): enter an invite code to join a round.\n"
    );
  });

  // SPA catch-all: serves index.html for page routes, but 404s for
  // unknown file-like paths. Returning 200 for every URL is a soft-404
  // that Google treats as a low-quality site signal.
  app.use("*", (req, res) => {
    const isFileLike = /\.[a-z0-9]{2,5}$/i.test(req.baseUrl) && !req.baseUrl.startsWith("/api");
    if (isFileLike && !path.extname(path.join(distPath, "index.html"))) {
      // unreachable in practice; kept for type narrowing
    }
    if (isFileLike) {
      res.status(404).sendFile(path.resolve(distPath, "index.html"));
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
