import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, CategoryDefinition } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeSpending = async (transactions: Transaction[], budgets: Record<string, number>, categories: CategoryDefinition[]) => {
  const summary = transactions.map(t => {
    const splitDetail = t.splits.map(s => `$${s.amount} in ${s.categoryName}`).join(', ');
    return `${t.date}: ${t.description} - Total $${t.totalAmount} (${splitDetail})`;
  }).join('\n');
  
  const budgetSummary = Object.entries(budgets).map(([cat, amt]) => `${cat}: $${amt}`).join('\n');
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Please analyze our data:\n\nTRANSACTIONS:\n${summary}\n\nBUDGET TARGETS:\n${budgetSummary}`,
    config: {
      systemInstruction: "You are a world-class financial coach for couples. Your goal is to help them find balance in their spending and save for their future together. Be encouraging, slightly witty, and very specific about where they can cut back based on their provided data. Use Markdown for formatting.",
    },
  });

  return response.text || "I couldn't generate a response. Please check your spending data.";
};

export const parseReceipt = async (base64Image: string, categories: CategoryDefinition[]): Promise<{amount: number, description: string, categoryName: string} | null> => {
  const catList = categories.map(c => c.name).join(', ');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: "Extract total, merchant, and category." }
        ]
      },
      config: {
        systemInstruction: `Extract data from receipt images. You must categorize the receipt into one of these: [${catList}]. Return the data in valid JSON format.`,
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
    console.error("Gemini Receipt Parsing Error:", error);
    return null;
  }
};