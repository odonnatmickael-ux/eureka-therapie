// /api/tts.js — version BÊTA TOKENS + EXPRESS BONUS (v4_express)
// ─────────────────────────────────────────────────────────────────────
// Évolution de tts_v33_tokens.js : ajoute la logique du bonus Express.
//
// Comportement standard (inchangé) :
// - Si "key" commence par "EUREKA-BETA-" → décrément du compteur du token dans Vercel KV.
//   À 1 → décrémenté à 0, requête autorisée avec ELEVEN_API_KEY serveur.
//   À 0 → refus 429.
// - Sinon → "key" est une vraie clé ElevenLabs, forward direct.
//
// NOUVEAU — Bonus Express :
// Le client peut passer "sessionMode" dans le body. Valeurs : "complete", "beta", "express".
// 1) Quand sessionMode === "complete" ET la requête utilise un token bêta valide :
//    après validation réussie, on SET `${TOKEN}_BONUS = 1` dans KV (création du droit Express).
// 2) Quand sessionMode === "express" :
//    on N'utilise PAS le compteur principal du token (déjà consommé par la complète).
//    À la place, on décrémente `${TOKEN}_BONUS`. Si > 0 : autorisé, on utilise la clé serveur.
//    Si bonus inexistant ou 0 : on refuse 429 avec message "Express bonus indisponible".
//
// Variables d'environnement Vercel :
// - ELEVEN_API_KEY
// - KV_REST_API_URL
// - KV_REST_API_TOKEN
//
// Compat : un client qui ne passe pas "sessionMode" → comportement v33 strict (1 crédit/token).

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

async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!r.ok) throw new Error(`KV set HTTP ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const body = req.body || {};
  // sessionMode est optionnel — accepte "complete" | "beta" | "express" | undefined
  const { key, voiceId, sessionMode, ...elevenBody } = body;

  if (!key || !voiceId) {
    return res.status(400).json({ error: "Champ 'key' ou 'voiceId' manquant" });
  }

  let effectiveKey = key;
  const isBetaToken = key.startsWith("EUREKA-BETA-");

  // ─── Chemin EXPRESS — utilise le bonus, pas le compteur principal ───
  if (isBetaToken && sessionMode === "express") {
    if (!KV_URL || !KV_TOKEN) {
      return res.status(500).json({
        error: "Vercel KV non configuré côté serveur (KV_REST_API_URL / KV_REST_API_TOKEN manquants)",
      });
    }
    if (!SERVER_ELEVEN_KEY) {
      return res.status(500).json({ error: "ELEVEN_API_KEY non configurée côté serveur" });
    }
    const bonusKey = key + "_BONUS";
    try {
      const newBonus = await kvDecr(bonusKey);
      if (Number.isNaN(newBonus) || newBonus < 0) {
        // Compensation : on remonte à 0 pour ne pas laisser le compteur en négatif
        try { await kvIncr(bonusKey); } catch (e) { /* ignore */ }
        return res.status(429).json({
          error: "Express bonus indisponible — la Complète doit avoir été générée avec ce token au préalable.",
        });
      }
      effectiveKey = SERVER_ELEVEN_KEY;
      console.log(`[/api/tts] Bonus Express ${bonusKey} consommé, restant=${newBonus}`);
    } catch (e) {
      console.error("[/api/tts] Erreur KV bonus :", e && e.message);
      return res.status(500).json({ error: "Erreur de validation du bonus Express (KV indisponible)" });
    }
  }
  // ─── Chemin STANDARD — token EUREKA-BETA-* avec décrément principal ───
  else if (isBetaToken) {
    if (!KV_URL || !KV_TOKEN) {
      return res.status(500).json({
        error: "Vercel KV non configuré côté serveur (KV_REST_API_URL / KV_REST_API_TOKEN manquants)",
      });
    }
    if (!SERVER_ELEVEN_KEY) {
      return res.status(500).json({ error: "ELEVEN_API_KEY non configurée côté serveur" });
    }
    try {
      const newValue = await kvDecr(key);
      if (Number.isNaN(newValue) || newValue < 0) {
        try { await kvIncr(key); } catch (e) { /* ignore */ }
        return res.status(429).json({
          error: "Token Eureka épuisé ou inconnu — contacte Mickaël pour un nouveau.",
        });
      }
      effectiveKey = SERVER_ELEVEN_KEY;
      console.log(`[/api/tts] Token ${key} validé, restant=${newValue}`);

      // Bonus Express : si c'est la complète qui vient d'être générée, ouvrir le droit
      // au bonus express (1 crédit supplémentaire, gratuit pour ce testeur).
      if (sessionMode === "complete") {
        try {
          await kvSet(key + "_BONUS", "1");
          console.log(`[/api/tts] Bonus Express ouvert pour ${key} (1 crédit)`);
        } catch (e) {
          // Non bloquant — la complète a quand même réussi
          console.warn(`[/api/tts] Échec ouverture bonus Express pour ${key} :`, e && e.message);
        }
      }
    } catch (e) {
      console.error("[/api/tts] Erreur KV :", e && e.message);
      return res.status(500).json({ error: "Erreur de validation du token (KV indisponible)" });
    }
  }
  // ─── Chemin CLIENT — vraie clé ElevenLabs personnelle ───
  // (pas de KV, pas de bonus — le client paye sa génération via sa propre clé)
  // effectiveKey = key (déjà assigné par défaut)

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
