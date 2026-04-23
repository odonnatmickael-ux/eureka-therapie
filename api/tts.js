export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text, voiceId } = req.body;
  try {
    const r = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voiceId,
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
            stability: 0.80,
            similarity_boost: 0.70,
            style: 0.08,
            use_speaker_boost: false,
            speed: 0.78
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
