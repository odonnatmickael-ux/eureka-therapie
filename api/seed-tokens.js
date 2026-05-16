// /api/seed-tokens.js — chargement initial des tokens bêta dans Upstash Redis
// ─────────────────────────────────────────────────────────────────────
// Endpoint d'admin à appeler UNE SEULE FOIS pour pré-charger les 20 tokens.
//
// Usage :
//   https://eureka-therapie.vercel.app/api/seed-tokens?secret=EUREKA-SEED-ZE40RPIVPHXH
//
// Le secret en query-string est obligatoire — sinon n'importe qui pourrait
// reset tes compteurs. Garde-le pour toi.
//
// Quand tu auras chargé les tokens, tu peux SUPPRIMER ce fichier de /api/
// (ce n'est pas obligatoire mais c'est plus propre).

const SEED_SECRET = "EUREKA-SEED-ZE40RPIVPHXH";

const TOKENS = [
  "EUREKA-BETA-BF7T7D",
  "EUREKA-BETA-YI1A8M",
  "EUREKA-BETA-VNML1W",
  "EUREKA-BETA-O8ETQF",
  "EUREKA-BETA-FV5BW4",
  "EUREKA-BETA-2MRKWG",
  "EUREKA-BETA-QZ7ZHM",
  "EUREKA-BETA-ESMLET",
  "EUREKA-BETA-S0WLV8",
  "EUREKA-BETA-1XXAIR",
  "EUREKA-BETA-OA1YUO",
  "EUREKA-BETA-4JPQHB",
  "EUREKA-BETA-0G3JXP",
  "EUREKA-BETA-CSW3I2",
  "EUREKA-BETA-CNLIZQ",
  "EUREKA-BETA-5LO4AT",
  "EUREKA-BETA-QS3719",
  "EUREKA-BETA-FF7ZUD",
  "EUREKA-BETA-LPPYAO",
  "EUREKA-BETA-LRE7PP",
];

const CREDITS_PER_TOKEN = 1;

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!r.ok) throw new Error(`KV set HTTP ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  const secret = (req.query && req.query.secret) || "";
  if (secret !== SEED_SECRET) {
    return res.status(403).json({ error: "Forbidden — secret invalide" });
  }
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: "Vercel KV non configuré côté serveur" });
  }
  const results = [];
  for (const token of TOKENS) {
    try {
      await kvSet(token, String(CREDITS_PER_TOKEN));
      results.push({ token, status: "ok", credits: CREDITS_PER_TOKEN });
    } catch (e) {
      results.push({ token, status: "error", error: e.message });
    }
  }
  return res.status(200).json({
    seeded: results.filter(r => r.status === "ok").length,
    failed: results.filter(r => r.status === "error").length,
    results,
  });
}
