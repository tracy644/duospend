
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey === '') return null;
  try {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  } catch (e) {
    console.error("Failed to initialize GoogleGenAI:", e);
    return null;
  }
};

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]) => {
  const ai = getAIClient();
  if (!ai) return "AI Coach is currently offline.";

  const summary = transactions.map(t => `${t.date}: ${t.description} - $${t.totalAmount} in ${t.splits[0]?.categoryName}`).join('\n');
  const budgetSummary = Object.entries(budgets).map(([cat, amt]) => `${cat}: $${amt}`).join('\n');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Analyze this couple's shared finances:\n\nSPENDING:\n${summary}\n\nLIMITS:\n${budgetSummary}`,
      config: {
        systemInstruction: "You are 'DuoCoach', a sharp financial advisor for couples. Provide 3 actionable tips based on their actual spending. Be concise, warm, and use emojis.",
      },
    });
    return response.text || "No insights found.";
  } catch (err) {
    return "Error connecting to AI Coach.";
  }
};

export const detectSubscriptions = async (transactions: Transaction[]) => {
  const ai = getAIClient();
  if (!ai) return null;

  const history = transactions.map(t => `${t.description} ($${t.totalAmount}) on ${t.date}`).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Identify likely recurring subscriptions or fixed costs from this history:\n\n${history}`,
      config: {
        systemInstruction: "Identify ghost subscriptions (Netflix, Spotify, Gym, etc.). Return a clean markdown list with the merchant name, amount, and why you think it's recurring. If none found, say 'No recurring subscriptions detected.'",
      },
    });
    return response.text;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const parseReceipt = async (base64Image: string, categories: CategoryDefinition[]): Promise<{amount: number, description: string, categoryName: string} | null> => {
  const ai = getAIClient();
  if (!ai) return null;
  const catList = categories.map(c => c.name).join(', ');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: "Extract receipt details." }
        ]
      },
      config: {
        systemInstruction: `Extract total, store, and category. Return ONLY JSON: { "amount": number, "description": string, "categoryName": string }. Available Categories: [${catList}].`,
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text.trim());
  } catch (error) {
    return null;
  }
};

export const parseVoiceTransaction = async (base64Audio: string, categories: CategoryDefinition[]) => {
  const ai = getAIClient();
  if (!ai) return null;
  const catList = categories.map(c => c.name).join(', ');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      contents: {
        parts: [
          { inlineData: { data: base64Audio, mimeType: 'audio/wav' } },
          { text: "The user is describing a transaction. Extract the details." }
        ]
      },
      config: {
        systemInstruction: `Extract description, amount, and category from the audio. Return ONLY JSON: { "amount": number, "description": string, "categoryName": string }. Categories: [${catList}]. If category is unclear, pick the closest one.`,
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Voice parsing error:", error);
    return null;
  }
};
