"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 8080;
const ROOT = path_1.default.basename(__dirname) === "dist" ? path_1.default.resolve(__dirname, "..") : __dirname;
app.disable("x-powered-by");
app.use(express_1.default.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "memory-orbit", timestamp: new Date().toISOString() });
});
app.use(express_1.default.static(ROOT, {
    extensions: ["html"],
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    },
}));
app.all("/api/*splat", (_req, res) => {
    res.status(404).json({ error: "API route not found." });
});
app.get(/.*/, (_req, res) => {
    res.sendFile(path_1.default.join(ROOT, "index.html"));
});
app.listen(PORT, () => {
    console.log(`Memory Orbit server running on http://localhost:${PORT}`);
});
