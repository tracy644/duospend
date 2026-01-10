declare var process: any;
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === 'undefined' || apiKey === '') {
    return null;
  }
  
  try {
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.error("Failed to initialize GoogleGenAI:", e);
    return null;
  }
};

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]) => {
  const ai = getAIClient();
  if (!ai) return "API Key not found in current build.";

  const summary = transactions.map(t => {
    return `${t.date}: ${t.description} - $${t.totalAmount} in ${t.splits[0]?.categoryName}`;
  }).join('\n');
  
  const budgetSummary = Object.entries(budgets).map(([cat, amt]) => `${cat}: $${amt}`).join('\n');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Analyze this couple's shared finances:\n\nSPENDING:\n${summary}\n\nLIMITS:\n${budgetSummary}`,
      config: {
        systemInstruction: "You are 'DuoCoach', a Sharp financial advisor for couples. Help them save. Provide 3 actionable tips. Be concise, warm, and use emojis.",
      },
    });
    return response.text || "No insights found.";
  } catch (err) {
    return "Error connecting to AI Coach.";
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
        systemInstruction: `Return JSON: { "amount": number, "description": string, "categoryName": string }. Categories: [${catList}].`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            description: { type: Type.STRING },
            categoryName: { type: Type.STRING }
          },
          required: ["amount", "description", "categoryName"]
        }
      }
    });
    if (!response.text) return null;
    return JSON.parse(response.text.trim());
  } catch (error) {
    return null;
  }
};