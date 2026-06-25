import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// TEMPORARY diagnostic route — lists which Gemini models this key can call.
// Delete after use. Does NOT expose the API key.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  // 1) Which models the key is allowed to list at all
  let available = null;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    const data = await resp.json();
    available = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name);
  } catch (e) {
    available = `list error: ${String(e?.message || e)}`;
  }

  // 2) Actually try a minimal generateContent on each candidate
  const genAI = new GoogleGenerativeAI(key);
  const tested = {};
  for (const name of CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      const r = await model.generateContent("Reply with the single word OK");
      tested[name] = { ok: true, sample: (r.response.text() || "").trim().slice(0, 40) };
    } catch (e) {
      const msg = String(e?.message || e);
      tested[name] = { ok: false, error: msg.slice(0, 200) };
    }
  }

  return NextResponse.json({ available, tested });
}
