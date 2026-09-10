import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationState, PharmacyOrder, ReviewCase, CaseStatus } from "../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data/runtime");
const STORE_PATH = join(DATA_DIR, "store.json");

interface PersistShape {
  conversations: Record<string, ConversationState>;
  cases: Record<string, ReviewCase>;
  orders: Record<string, PharmacyOrder>;
}

function emptyStore(): PersistShape {
  return { conversations: {}, cases: {}, orders: {} };
}

function load(): PersistShape {
  try {
    if (!existsSync(STORE_PATH)) return emptyStore();
    const raw = readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistShape;
    return {
      conversations: parsed.conversations ?? {},
      cases: parsed.cases ?? {},
      orders: parsed.orders ?? {},
    };
  } catch {
    return emptyStore();
  }
}

function save(data: PersistShape): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

let memory = load();

export const store = {
  reset(): void {
    memory = emptyStore();
    save(memory);
  },

  saveConversation(conversation: ConversationState): ConversationState {
    memory.conversations[conversation.id] = conversation;
    save(memory);
    return conversation;
  },

  getConversation(id: string): ConversationState | undefined {
    return memory.conversations[id];
  },

  listConversations(): ConversationState[] {
    return Object.values(memory.conversations).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  saveCase(reviewCase: ReviewCase): ReviewCase {
    memory.cases[reviewCase.id] = reviewCase;
    save(memory);
    return reviewCase;
  },

  getCase(id: string): ReviewCase | undefined {
    return memory.cases[id];
  },

  listCases(): ReviewCase[] {
    return Object.values(memory.cases).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  updateCaseStatus(id: string, status: CaseStatus, reviewerNotes?: string): ReviewCase | undefined {
    const existing = memory.cases[id];
    if (!existing) return undefined;
    existing.status = status;
    existing.updatedAt = new Date().toISOString();
    if (reviewerNotes !== undefined) existing.reviewerNotes = reviewerNotes;
    save(memory);
    return existing;
  },

  saveOrder(order: PharmacyOrder): PharmacyOrder {
    memory.orders[order.id] = order;
    save(memory);
    return order;
  },

  getOrder(id: string): PharmacyOrder | undefined {
    return memory.orders[id];
  },

  listOrders(): PharmacyOrder[] {
    return Object.values(memory.orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
