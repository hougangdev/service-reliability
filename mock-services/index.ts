import express, { Request, Response } from "express";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Healthy: 200, JSON with version "2.1.0"
app.get("/api/healthy", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: "2.1.0" });
});

// Degraded: 200 with 1.5s delay, version "2.1.0"
app.get("/api/degraded", (_req: Request, res: Response) => {
  setTimeout(() => {
    res.json({ status: "ok", version: "2.1.0" });
  }, 1500);
});

// Wrong version: 200, version "1.9.0" (for drift detection)
app.get("/api/wrong-version", (_req: Request, res: Response) => {
  res.json({ status: "ok", version: "1.9.0" });
});

// Failing: 503 every other request
let failingToggle = false;
app.get("/api/failing", (_req: Request, res: Response) => {
  failingToggle = !failingToggle;
  if (failingToggle) {
    res.status(503).json({ error: "Service Unavailable" });
  } else {
    res.json({ status: "ok", version: "2.1.0" });
  }
});

// Timeout: hangs 10s (for timeout handling tests)
app.get("/api/timeout", (_req: Request, res: Response) => {
  setTimeout(() => res.json({ status: "ok" }), 10_000);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "up" });
});

app.listen(PORT, () => {
  console.log(`Mock services listening on port ${PORT}`);
});
