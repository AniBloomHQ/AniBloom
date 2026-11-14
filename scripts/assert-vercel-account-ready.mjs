import { pathToFileURL } from "node:url";

export function assertVercelAccountReady(payload) {
  const statuses = Array.isArray(payload) ? payload : payload?.statuses || [];
  const blocked = statuses.some(status => String(status?.context || "").toLowerCase() === "vercel"
    && ["failure", "error"].includes(String(status?.state || "").toLowerCase())
    && /\baccount is blocked\b/i.test(String(status?.description || "")));
  if (blocked) throw new Error("Vercel account is blocked; refusing deployment and production polling. Restore account capacity before retrying.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  assertVercelAccountReady(JSON.parse(input));
}
