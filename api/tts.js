export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { text, voiceId } = req.body;

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voiceId,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVEN_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2", // ✅ retour stable
          voice_settings: {
            stability: 0.65,
            similarity_boost: 0.7,
            style: 0.1,
            use_speaker_boost: true,
            speed: 0.7
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("ELEVEN ERROR:", error);
      return res.status(500).json({ error });
    }

    const audioBuffer = await response.arrayBuffer();

    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
