function createGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  modelName = process.env.MODEL_NAME ?? 'gemini-2.5-flash',
  fetchImpl = fetch,
  timeoutMs = 5000
} = {}) {
  return {
    async generateSummary(slots) {
      if (!apiKey) throw new Error('Gemini API key is not configured.');
      const endpoint = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`
      );
      endpoint.searchParams.set('key', apiKey);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Summarize this public lab availability data in one short sentence. Return only JSON with a "summary" string and "slotIds" array. Use only these slots. Do not infer personal information. Data: ${JSON.stringify(slots)}`
            }]
          }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      if (!response.ok) throw new Error('Gemini request failed.');

      const body = await response.json();
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') throw new Error('Gemini returned no summary.');
      return JSON.parse(text);
    }
  };
}

module.exports = { createGeminiClient };
