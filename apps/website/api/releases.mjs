import { getReleaseMetadata } from "./_store.mjs";
import { isSupabaseConfigured, supabaseListReleases } from "./_supabase.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const external = isSupabaseConfigured() ? await supabaseListReleases() : null;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(getReleaseMetadata(external)));
}
