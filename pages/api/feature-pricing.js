// GET /api/feature-pricing — returns feature config for client
import { readFileSync } from "fs";
import { join } from "path";

let FEATURES = [];
try {
  FEATURES = JSON.parse(readFileSync(join(process.cwd(), "data", "feature-pricing.json"), "utf8"));
} catch {}

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  res.json(FEATURES);
}
