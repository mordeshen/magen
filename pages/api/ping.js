// Lightweight keep-alive endpoint — no DB calls, no API calls, zero cost.
export default function handler(_req, res) {
  res.status(200).json({ ok: true, t: Date.now() });
}
