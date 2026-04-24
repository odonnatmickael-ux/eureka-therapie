export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { text, voiceId } = req.body;

  // ─── Réglages adaptés selon la voix ───────────────────────────────────────
  const VOICE_SETTINGS = {

    // ── Voix féminines ────────────────────────────────────────────────────────
    "4RZ84U1b4WCqpu57LvIq": { // Bella — douce, enveloppante
      stability: 0.65,
      similarity_boost: 0.70,
      style: 0.20,
      use_speaker_boost: false,
      speed: 0.72
    },
    "9BWtsMINqrJLrRacOk9x": { // Aria — apaisante, claire
      stability: 0.75,
      similarity_boost: 0.70,
      style: 0.15,
      use_speaker_boost: false,
      speed: 0.70
    },

    // ── Voix masculines ───────────────────────────────────────────────────────
    "pNInz6obpgDQGcFmaJgB": { // Adam — grave, rassurant
      stability: 0.82,
      similarity_boost: 0.60,
      style: 0.08,
      use_speaker_boost: false,
      speed: 0.68
    },
    "nPczCjzI2devNBz1zQrb": { // Brian — posé, neutre
      stability: 0.70,
      similarity_boost: 0.68,
      style: 0.10,
      use_speaker_boost: false,
      speed: 0.72
    },
  };

  // Réglages par défaut si voix inconnue (Bella)
  const settings = VOICE_SETTINGS[voiceId] || VOICE_SETTINGS["4RZ84U1b4WCqpu57LvIq"];
  const voice = voiceId || "4RZ84U1b4WCqpu57LvIq";

  try {
    const r = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voice,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVEN_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: settings
        })
      }
    );

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }

    const buffer = await r.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(Buffer.from(buffer));

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
