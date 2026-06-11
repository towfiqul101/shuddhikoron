import { NextResponse } from "next/server";
import { callGemini, REWRITE_PROMPT } from "../gemini";

export async function POST(request) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    
    // Calls our orchestrator (Gemini first, Groq fallback)
    const result = await callGemini(REWRITE_PROMPT, text);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error("Rewrite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
