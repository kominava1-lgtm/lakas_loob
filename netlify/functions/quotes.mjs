import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const store = getStore("lakas-loob-quotes");
const allowedTags = new Set(["Exams", "Money", "Family", "Lonely", "Pressure", "Other"]);
const crisisPattern = /(kill myself|suicid|end my life|self.?harm|hurt myself|want to die|magpakamatay|ayoko nang mabuhay|patayin ko sarili)/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function listQuotes(prefix) {
  const items = [];
  for await (const page of store.list({ prefix, paginate: true })) {
    for (const blob of page.blobs) {
      const item = await store.get(blob.key, { type: "json" });
      if (item) items.push(item);
    }
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, 100);
}

export default async (request) => {
  if (request.method === "GET") {
    try {
      return json({ items: await listQuotes("approved:") });
    } catch {
      return json({ error: "Quote feed is temporarily unavailable." }, 503);
    }
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = request.headers.get("authorization");
    const moderatorToken = process.env.QUOTE_MODERATOR_TOKEN;
    const isModerator = Boolean(moderatorToken) && authorization === `Bearer ${moderatorToken}`;
    if (authorization && !isModerator) return json({ error: "Invalid moderator key." }, 401);

    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const tag = allowedTags.has(body.tag) ? body.tag : "";
    if (text.length < 10 || text.length > 140) return json({ error: "Quote must be 10 to 140 characters." }, 400);
    if (crisisPattern.test(text)) return json({ error: "This message needs support, not a public post. Please contact someone you trust or a crisis hotline." }, 400);

    const item = { id: randomUUID(), text, tag, ts: Date.now() };
  await store.setJSON(`${isModerator ? "approved" : "pending"}:${item.id}`, item);
  return json({ ok: true, approved: isModerator }, 201);
  } catch (error) {
    console.error("Quote submission failed:", error);
    return json({ error: "Could not submit this quote." }, 500);
  }
};