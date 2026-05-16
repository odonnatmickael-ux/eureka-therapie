// /api/tts.js — version BÊTA TOKENS (v33)
// ─────────────────────────────────────────────────────────────────────
// Proxy ElevenLabs avec support des tokens Eureka pour bêta test.
//
// Comportement :
// - Si le champ "key" reçu commence par "EUREKA-BETA-" → on valide le token
//   dans Vercel KV (décrément atomique, refus si < 0), puis on appelle
//   ElevenLabs avec la clé serveur ELEVEN_API_KEY.
// - Sinon → on traite "key" comme une vraie clé ElevenLabs et on forward direct.
//
// Variables d'environnement requises sur Vercel :
// - ELEVEN_API_KEY (ta vraie clé ElevenLabs, du compte payant que tu utilises pour le bêta)
// - KV_REST_API_URL (auto-créée quand tu actives Vercel KV)
// - KV_REST_API_TOKEN (auto-créée quand tu actives Vercel KV)
//
// Pour revenir au comportement actuel (sans tokens), remettre l'ancien tts.js.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const SERVER_ELEVEN_KEY = process.env.ELEVEN_API_KEY;

async function kvDecr(key) {
  const r = await fetch(`${KV_URL}/decr/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!r.ok) throw new Error(`KV decr HTTP ${r.status}`);
  const data = await r.json();
  return parseInt(data.result, 10);
}

async function kvIncr(key) {
  const r = await fetch(`${KV_URL}/incr/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!r.ok) throw new Error(`KV incr HTTP ${r.status}`);
  const data = await r.json();
  return parseInt(data.result, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const body = req.body || {};
  const { key, voiceId, ...elevenBody } = body;

  if (!key || !voiceId) {
    return res.status(400).json({ error: "Champ 'key' ou 'voiceId' manquant" });
  }

  let effectiveKey = key;

  // ─── Token Eureka : validation côté serveur via Vercel KV ───
  if (key.startsWith("EUREKA-BETA-")) {
    if (!KV_URL || !KV_TOKEN) {
      return res.status(500).json({
        error: "Vercel KV non configuré côté serveur (KV_REST_API_URL / KV_REST_API_TOKEN manquants)",
      });
    }
    if (!SERVER_ELEVEN_KEY) {
      return res.status(500).json({
        error: "ELEVEN_API_KEY non configurée côté serveur",
      });
    }
    try {
      const newValue = await kvDecr(key);
      if (Number.isNaN(newValue) || newValue < 0) {
        // Restaurer pour ne pas laisser le compteur partir en négatif
        try { await kvIncr(key); } catch (e) { /* ignore */ }
        return res.status(429).json({
          error: "Token Eureka épuisé ou inconnu — contacte Mickaël pour un nouveau.",
        });
      }
      effectiveKey = SERVER_ELEVEN_KEY;
      console.log(`[/api/tts] Token ${key} validé, restant=${newValue}`);
    } catch (e) {
      console.error("[/api/tts] Erreur KV :", e && e.message);
      return res.status(500).json({
        error: "Erreur de validation du token (KV indisponible)",
      });
    }
  }

  // ─── Forward à ElevenLabs avec la clé effective ───
  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": effectiveKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(elevenBody),
      }
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain");
      return res.send(errorText);
    }

    const audioBuffer = await upstream.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(Buffer.from(audioBuffer));
  } catch (e) {
    console.error("[/api/tts] Erreur réseau ElevenLabs :", e && e.message);
    return res.status(500).json({
      error: (e && e.message) || "Erreur réseau ElevenLabs",
    });
  }
}
