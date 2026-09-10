import cors from "cors";
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConversation, processUserMessage } from "../agent/index.js";
import { listMedications } from "../data/medications.js";
import { listDemoScenarios } from "../data/scenarios.js";
import { store } from "../store/index.js";
import type { CaseStatus } from "../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../../public");

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "mental-health-refill-agent",
      demo: true,
      evaluation: "rubric_only",
    });
  });

  app.get("/api/scenarios", (_req, res) => {
    res.json({ scenarios: listDemoScenarios() });
  });

  app.get("/api/medications", (_req, res) => {
    res.json({ medications: listMedications() });
  });

  app.post("/api/chat/sessions", (_req, res) => {
    const conversation = createConversation();
    store.saveConversation(conversation);
    res.status(201).json({ conversation });
  });

  app.get("/api/chat/sessions/:id", (req, res) => {
    const conversation = store.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json({ conversation });
  });

  app.post("/api/chat/sessions/:id/messages", (req, res) => {
    const conversation = store.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conversation.phase === "completed") {
      res.status(409).json({
        error: "Conversation already completed",
        conversation,
      });
      return;
    }

    const content = typeof req.body?.content === "string" ? req.body.content : "";
    if (!content.trim()) {
      res.status(400).json({ error: "Message content is required" });
      return;
    }

    try {
      const result = processUserMessage(conversation, content);
      store.saveConversation(result.conversation);
      if (result.createdCase) store.saveCase(result.createdCase);
      if (result.createdOrder) store.saveOrder(result.createdOrder);

      res.json({
        conversation: result.conversation,
        assistantMessage: result.assistantMessage,
        case: result.createdCase ?? null,
        order: result.createdOrder ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown agent error";
      res.status(500).json({ error: `Agent failed: ${message}` });
    }
  });

  app.get("/api/cases", (_req, res) => {
    res.json({ cases: store.listCases() });
  });

  app.get("/api/cases/:id", (req, res) => {
    const reviewCase = store.getCase(req.params.id);
    if (!reviewCase) {
      res.status(404).json({ error: "Case not found" });
      return;
    }
    res.json({ case: reviewCase });
  });

  app.patch("/api/cases/:id", (req, res) => {
    const status = req.body?.status as CaseStatus | undefined;
    const allowed: CaseStatus[] = [
      "pending",
      "in_review",
      "resolved_refill",
      "resolved_no_refill",
      "closed",
    ];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
      return;
    }
    const notes = typeof req.body?.reviewerNotes === "string" ? req.body.reviewerNotes : undefined;
    const updated = store.updateCaseStatus(req.params.id, status, notes);
    if (!updated) {
      res.status(404).json({ error: "Case not found" });
      return;
    }
    res.json({ case: updated });
  });

  app.get("/api/orders", (_req, res) => {
    res.json({ orders: store.listOrders() });
  });

  app.get("/api/orders/:id", (req, res) => {
    const order = store.getOrder(req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({ order });
  });

  app.post("/api/demo/reset", (_req, res) => {
    store.reset();
    res.json({ ok: true, message: "In-memory / file store cleared." });
  });

  app.use(express.static(publicDir));

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(join(publicDir, "index.html"));
  });

  return app;
}
