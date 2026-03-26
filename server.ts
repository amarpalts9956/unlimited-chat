import express, { type Request, type Response } from "express";
import path from "path";

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.basename(__dirname) === "dist" ? path.resolve(__dirname, "..") : __dirname;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "memory-orbit", timestamp: new Date().toISOString() });
});

app.use(
  express.static(ROOT, {
    extensions: ["html"],
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    },
  })
);

app.all("/api/*splat", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API route not found." });
});

app.get(/.*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Memory Orbit server running on http://localhost:${PORT}`);
});
