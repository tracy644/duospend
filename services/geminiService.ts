
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

const getAIClient = () => {
  // Vite replaces the token process.env.API_KEY with the actual value from Vercel during build
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === 'undefined' || apiKey === '') {
    return null;
  }
  
  try {
    // Guidelines: Use process.env.API_KEY string directly when initializing the client instance
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  } catch (e) {
    console.error("Failed to initialize GoogleGenAI:", e);
    return null;
  }
};

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]) => {
  const ai = getAIClient();
  if (!ai) return "AI Coach is currently offline (API Key Missing).";

  const summary = transactions.map(t => {
    return `${t.date}: ${t.description} - $${t.totalAmount} in ${t.splits[0]?.categoryName}`;
  }).join('\n');
  
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
    console.error(err);
    return "Error connecting to AI Coach. Please try again later.";
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
        systemInstruction: `Extract the total amount, store name, and best category. Return ONLY JSON: { "amount": number, "description": string, "categoryName": string }. Available Categories: [${catList}].`,
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
    console.error("Receipt parsing error:", error);
    return null;
  }
};
