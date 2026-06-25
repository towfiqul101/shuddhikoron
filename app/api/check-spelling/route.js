import { NextResponse } from "next/server";
import { checkSpellingWithGemini, checkSpellingWithGroq } from "../gemini";

export async function POST(request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    let result;
    try {
      result = await checkSpellingWithGemini(text);
    } catch (geminiError) {
      console.error("Gemini spell check failed, falling back to Groq:", geminiError);
      result = await checkSpellingWithGroq(text);
    }
    return NextResponse.json(result);

  } catch (error) {
    console.error("Spell check error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
