import { NextResponse } from "next/server";
import { checkSpellingWithGemini } from "../gemini";

export async function POST(request) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    
    const result = await checkSpellingWithGemini(text);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error("Spell check error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
