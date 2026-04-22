export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { text, voiceId } = req.body;

  try {
    // 🔥 Ajout d’un préfixe pour ralentir le début
    const slowStart = "… doucement… tranquillement… ";
    const finalText = slowStart + text;

    const r = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voiceId,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVEN_API_KEY
        },
        body: JSON.stringify({
          text: finalText,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.2,
            use_speaker_boost: true,
            speed: 0.7
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
