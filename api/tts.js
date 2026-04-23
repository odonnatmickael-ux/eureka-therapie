export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { text, voiceId } = req.body;

  // ID par défaut : Bella (douce, enveloppante — recommandée pour sophrologie)
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
          voice_settings: {
            // ─── Réglages validés pour effet hypnotique / sophrologie ───
            // stability        : 0.65 = légère variation naturelle, pas robotique
            // similarity_boost : 0.70 = fidélité à la voix source
            // style            : 0.20 = légère expressivité — chaleur sans dynamisme commercial
            // speaker_boost    : false — désactiver la brillance studio
            // speed            : 0.72 = rythme lent enveloppant
            stability: 0.65,
            similarity_boost: 0.70,
            style: 0.20,
            use_speaker_boost: false,
            speed: 0.72
          }
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
