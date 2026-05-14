// /api/udio.js — proxy Vercel vers udioapi.pro
// Garde la clé UDIO_API_KEY côté serveur (jamais exposée au client).
//
// Endpoints exposés au front EUREKA :
//   POST /api/udio?action=generate     → body : { prompt, style, title, model? } → renvoie { workId, ... }
//   GET  /api/udio?action=feed&workId=xxx → renvoie { response_data: [...], ... }
//   GET  /api/udio?action=credits      → renvoie le solde de crédits

const UDIO_BASE = "https://udioapi.pro/api/v2";

export default async function handler(req, res) {
  const apiKey = process.env.UDIO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "UDIO_API_KEY non configurée côté serveur Vercel",
    });
  }

  const action = req.query && req.query.action;

  try {
    // ─── GENERATE — POST ────────────────────────────────────────────
    if (action === "generate" && req.method === "POST") {
      const body = req.body || {};
      // Sécurité : on accepte uniquement les champs documentés
      const payload = {
        model: body.model || "chirp-v4-5",
        prompt: body.prompt || "",
        style: body.style || "",
        title: body.title || "",
        make_instrumental: body.make_instrumental === true,
      };
      if (body.gender) payload.gender = body.gender;
      if (typeof body.style_weight === "number") payload.style_weight = body.style_weight;
      if (typeof body.weirdness_constraint === "number") payload.weirdness_constraint = body.weirdness_constraint;
      if (typeof body.audio_weight === "number") payload.audio_weight = body.audio_weight;

      const upstream = await fetch(UDIO_BASE + "/generate", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
      return res.status(upstream.status).json(data);
    }

    // ─── FEED — GET (polling) ───────────────────────────────────────
    if (action === "feed" && req.method === "GET") {
      const workId = req.query && req.query.workId;
      if (!workId) {
        return res.status(400).json({ error: "workId manquant dans la query" });
      }
      const upstream = await fetch(
        UDIO_BASE + "/feed?workId=" + encodeURIComponent(workId),
        {
          method: "GET",
          headers: { "Authorization": "Bearer " + apiKey },
        }
      );
      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
      return res.status(upstream.status).json(data);
    }

    // ─── CREDITS — GET ──────────────────────────────────────────────
    if (action === "credits" && req.method === "GET") {
      const upstream = await fetch(UDIO_BASE + "/query-credits", {
        method: "GET",
        headers: { "Authorization": "Bearer " + apiKey },
      });
      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
      return res.status(upstream.status).json(data);
    }

    return res.status(400).json({
      error: "Action invalide ou méthode HTTP non supportée",
      received: { action: action, method: req.method },
    });
  } catch (err) {
    console.error("[/api/udio] Erreur :", err);
    return res.status(500).json({
      error: (err && err.message) || "Erreur inconnue côté proxy",
    });
  }
}
