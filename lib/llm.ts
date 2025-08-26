// lib/llm.ts
import OpenAI from "openai";
import crypto from "node:crypto";
import { prisma } from "./db";

type LlmInput = { pairId: string; conceptA?: string; conceptB?: string; typeA?: string; typeB?: string };

type LlmOutput = {
  pairId: string;
  rational: string;
  relationshipType?: string;
  relationshipCode?: number;
  usage?: { promptTokens?: number; completionTokens?: number };
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function promptFor(input: LlmInput) {
  return `Given two clinical concepts, propose the relationship type and a concise rationale.

Concept A: ${input.conceptA ?? ""} (type: ${input.typeA ?? "?"})
Concept B: ${input.conceptB ?? ""} (type: ${input.typeB ?? "?"})

Return strict JSON with keys: rational (<=255 chars), relationshipType (<=12 chars), relationshipCode (integer).`;
}

function hashPrompt(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// NOTE: make model a definite string
export async function runLlmBatch(inputs: LlmInput[], modelOverride?: string) {
  const model = modelOverride ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini"; // <= always a string
  const outputs: LlmOutput[] = [];

  for (const input of inputs) {
    const prompt = promptFor(input);
    const key = hashPrompt(model + "::" + prompt);

    const cached = await prisma.llmCache.findUnique({ where: { promptKey: key } });
    if (cached) {
      try {
        const cachedJson = JSON.parse(cached.result);
        outputs.push({
          pairId: input.pairId,
          ...cachedJson,
          usage: { promptTokens: cached.tokensIn ?? 0, completionTokens: cached.tokensOut ?? 0 },
        });
        continue;
      } catch {}
    }

    const resp = await client.chat.completions.create({
      model, // <= now definitely a string
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = resp.choices[0]?.message?.content ?? "{}";
    const usage = resp.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

    await prisma.llmCache.create({
      data: {
        promptKey: key,
        result: content,
        tokensIn: usage.prompt_tokens ?? undefined,
        tokensOut: usage.completion_tokens ?? undefined,
        model, // store the actual model string we used
      },
    });

    const parsed = JSON.parse(content);
    outputs.push({
      pairId: input.pairId,
      rational: parsed.rational ?? "",
      relationshipType: parsed.relationshipType ?? undefined,
      relationshipCode: parsed.relationshipCode ?? undefined,
      usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens },
    });
  }

  return outputs;
}
