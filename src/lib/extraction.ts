import Anthropic from "@anthropic-ai/sdk";
import { buildExtractionSystemPrompt } from "./constructs";
import { EXTRACTION_SCHEMA, ExtractionData } from "./schema";

// LLM everything-except-voice is Anthropic Claude Opus 4.8 (spec §3), in
// structured-output mode. One extraction call per entry. The model only
// extracts, cites, and phrases — all digest numbers are computed in code.

const MODEL = process.env.EXTRACTION_MODEL ?? "claude-opus-4-8";

let _client: Anthropic | null = null;
function client(): Anthropic {
  // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login`
  // profile from the environment.
  if (!_client) _client = new Anthropic();
  return _client;
}

const SYSTEM_PROMPT = buildExtractionSystemPrompt();

export interface ExtractionResult {
  data: ExtractionData;
  model: string;
}

export async function extractEntry(transcript: string): Promise<ExtractionResult> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    // Static system prompt — cached across the seed batch and repeat renders.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: EXTRACTION_SCHEMA,
      },
    },
    messages: [
      {
        role: "user",
        content: `Extract the structured record from this daily check-in transcript.\n\nTranscript:\n"""\n${transcript}\n"""`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  // With structured outputs the response contains a text block whose content is
  // valid JSON conforming to EXTRACTION_SCHEMA (thinking blocks precede it).
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `extraction: no text block in response (stop_reason=${response.stop_reason})`,
    );
  }

  const data = JSON.parse(textBlock.text) as ExtractionData;
  return { data, model: response.model };
}
