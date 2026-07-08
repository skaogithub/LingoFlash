import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to get runtime config (API Keys)
  app.get("/api/config", (req, res) => {
    // Check multiple possible environment variable names
    const key = process.env.USER_GEMINI_API_KEY ||
                process.env.GEMINI_API_KEY || 
                process.env.API_KEY || 
                process.env.VITE_GEMINI_API_KEY || 
                process.env.GOOGLE_API_KEY || "";
                
    const prefix = key ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : "None";
    console.log(`[Config API] Request from ${req.ip}. Key status: ${key ? 'Found' : 'Missing'}. Prefix: ${prefix}`);
    
    res.json({
      geminiApiKey: key,
      status: key ? "ok" : "missing_key",
      env: process.env.NODE_ENV
    });
  });

  // API to list data files
  app.get("/api/files", (req, res) => {
    const dataDir = path.join(process.cwd(), "data");
    
    if (!fs.existsSync(dataDir)) {
      return res.json([]);
    }

    const getFiles = (dir: string, baseDir: string): any[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.map((entry) => {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            type: "directory",
            path: relativePath,
            children: getFiles(fullPath, baseDir),
          };
        } else if (entry.name.endsWith(".json")) {
          return {
            name: entry.name,
            type: "file",
            path: relativePath,
          };
        }
        return null;
      }).filter(Boolean);
    };

    try {
      const files = getFiles(dataDir, dataDir);
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  // API to read a data file
  app.get("/api/data/*", (req, res) => {
    const relativePath = req.params[0];
    const fullPath = path.join(process.cwd(), "data", relativePath);

    if (!fullPath.startsWith(path.join(process.cwd(), "data"))) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return res.status(404).json({ error: "File not found" });
    }

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      res.json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
