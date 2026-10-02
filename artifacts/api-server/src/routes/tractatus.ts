import { Router, type IRouter } from "express";
import { GenerateTractatusBody, DetectTextBody, DetectTextResponse } from "@workspace/api-zod";
import { generate, detect } from "../lib/tractatus";

const router: IRouter = Router();

router.post("/tractatus/generate", async (req, res): Promise<void> => {
  const input = GenerateTractatusBody.safeParse(req.body);
  if (!input.success || !input.data.text.trim()) {
    res.status(400).json({ error: "Provide text and a valid generation stage." });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const send = (event: object) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  const heartbeat = setInterval(() => { if (!res.destroyed) res.write(": heartbeat\n\n"); }, 10000);
  try {
    await generate(input.data.stage, input.data.text, send, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) {
      req.log.error({ message: error instanceof Error ? error.message : "Generation failed" }, "Tractatus generation failed");
      send({ error: error instanceof Error ? error.message : "Generation failed. Partial output is retained." });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

router.post("/tractatus/detect", async (req, res): Promise<void> => {
  const input = DetectTextBody.safeParse(req.body);
  if (!input.success || input.data.text.trim().length < 250) {
    res.status(400).json({ error: "GPTZero requires at least 250 characters for this app's automatic checks." });
    return;
  }
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  try {
    const result = await detect(input.data.text, controller.signal);
    res.json(DetectTextResponse.parse(result));
  } catch (error) {
    if (!controller.signal.aborted) {
      req.log.warn({ message: error instanceof Error ? error.message : "Detection failed" }, "GPTZero detection failed");
      res.status(502).json({ error: error instanceof Error ? error.message : "GPTZero detection failed." });
    }
  }
});

export default router;