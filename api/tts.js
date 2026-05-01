export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // modelId et voiceSettings sont optionnels :
  // - si non fournis → comportement historique (v2 + speed par défaut de la voix)
  // - si fournis → on les utilise tels quels (utile pour faire matcher la démo Landing
  //   avec les vrais réglages de la séance, ex: Mickaël en eleven_v3)
  const { text, voiceId, modelId, voiceSettings } = req.body;

  const SPEEDS = {
    "4RZ84U1b4WCqpu57LvIq": 0.78,  // Bella
    "9BWtsMINqrJLrRacOk9x": 0.78,  // Aria
    "pNInz6obpgDQGcFmaJgB": 0.78,  // Adam
    "nPczCjzI2devNBz1zQrb": 0.78,  // Brian
    "YV28ox2c5Cuh5rim0LrW": 0.78,  // Marcel
    "cQVn2FWawJsxa2z9X3l1": 0.90,  // Valentin
    "5l4ttmr4SKNgi0HnOelT": 0.78,  // Paul K
    "HeQxwrjIb6zvCa1bt1EE": 0.78,  // Ludovic
    "19cV422MaCP4oU6N8AFm": 0.90,  // Mickaël (nouvelle voix ElevenLabs)
  };

  const voice = voiceId || "4RZ84U1b4WCqpu57LvIq";
  const speed = SPEEDS[voice] || 0.78;

  // Modèle effectif : celui demandé par le client, sinon eleven_multilingual_v2 par défaut
  const effectiveModel = modelId || "eleven_multilingual_v2";
  // Réglages effectifs : ceux demandés par le client, sinon juste { speed } par défaut
  const effectiveSettings = voiceSettings || { speed: speed };

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
          model_id: effectiveModel,
          voice_settings: effectiveSettings
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
