import axios from "axios";

export const extractJsonFromText = (text: string): string => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini response does not contain a JSON object");
  }

  return text.slice(start, end + 1);
};

export const parseGeminiJsonObject = <T = any>(text: string): T => {
  return JSON.parse(extractJsonFromText(text));
};

type GenerateGeminiResponseTextParams = {
  prompt: string;
  model: string;
  temperature: number;
  timeoutMs: number;
};

export const generateGeminiResponseText = async (
  params: GenerateGeminiResponseTextParams
): Promise<string> => {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const geminiApiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent`;

  const response = await axios.post(
    geminiApiUrl,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig: {
        temperature: params.temperature,
        responseMimeType: "application/json",
      },
    },
    {
      params: {
        key: geminiApiKey,
      },
      timeout: params.timeoutMs,
    }
  );

  const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textResponse || typeof textResponse !== "string") {
    throw new Error("Gemini returned empty response");
  }

  return textResponse;
};
