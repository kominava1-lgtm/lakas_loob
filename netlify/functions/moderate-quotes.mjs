import { getStore } from "@netlify/blobs";

const store = getStore("lakas-loob-quotes");

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function authorized(request) {
  const secret = process.env.QUOTE_MODERATOR_TOKEN;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function listPending() {
  const items = [];
  for await (const page of store.list({ prefix: "pending:", paginate: true })) {
    for (const blob of page.blobs) {
      const item = await store.get(blob.key, { type: "json" });
      if (item) items.push(item);
    }
  }
  return items.sort((a, b) => a.ts - b.ts).slice(0, 100);
}

export default async (request) => {
  if (!process.env.QUOTE_MODERATOR_TOKEN) return json({ error: "Moderator access is not configured." }, 503);
  if (!authorized(request)) return json({ error: "Invalid moderator key." }, 401);

  try {
    if (request.method === "GET") return json({ items: await listPending() });
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const { id, action } = await request.json();
    if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id) || !["approve", "reject"].includes(action)) {
      return json({ error: "Invalid moderation request." }, 400);
    }

    const key = `pending:${id}`;
    const item = await store.get(key, { type: "json" });
    if (!item) return json({ error: "This quote is no longer waiting for review." }, 404);
    if (action === "approve") await store.setJSON(`approved:${id}`, item);
    await store.delete(key);
    return json({ ok: true });
  } catch {
    return json({ error: "Could not update this quote." }, 500);
  }
};