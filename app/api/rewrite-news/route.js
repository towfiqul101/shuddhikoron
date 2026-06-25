import { NextResponse } from "next/server";
import { rewriteNewsWithGemini, rewriteNewsWithGroq } from "../gemini";

// Allow time for Gemini retries + Groq fallback before timing out.
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    let result;
    try {
      result = await rewriteNewsWithGemini(text);
    } catch (geminiError) {
      console.error("Gemini rewrite failed, falling back to Groq:", geminiError);
      result = await rewriteNewsWithGroq(text);
    }
    return NextResponse.json(result);

  } catch (error) {
    console.error("Rewrite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
