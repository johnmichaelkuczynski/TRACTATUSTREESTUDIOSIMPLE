import { openai, batchProcess } from "@workspace/integrations-openai-ai-server";

export type Stage = "tree" | "variation" | "prose";
export type StreamEvent = { content?: string; status?: string; done?: boolean; error?: string };

const instructions: Record<Stage, string> = {
  tree: `Create an exhaustive Tractatus-style analytic tree of the supplied book or paper.
Preserve every distinct claim, argument step, distinction, qualification, objection, response, and concrete example. This is decomposition, NOT summary. Do not add claims or correct the author's claims. Attribute claims to the author where appropriate.
Use decimal hierarchy: root theses 1.0, 2.0, etc.; children 1.1, 1.2; grandchildren 1.1.1 and deeper as needed. One precise proposition per numbered line. Parents state the general thesis; children explain, justify, qualify, or exemplify that thesis. Preserve logical dependence. Expand as deeply as needed to capture ALL detail. Output the full tree once, not repeated cumulative summaries at each level. No introduction, Markdown fences, filler, or conclusion.`,
  variation: `Produce a variation of the supplied Tractatus tree. Preserve EVERY numbered proposition, its number, hierarchy, logical role, argument, qualification, and substantive thesis. Change only illustrative concrete examples, names used in examples, and analogies to fresh, accurate examples with the SAME logical function. Rephrase statements naturally without changing meaning. Do not replace real authors, technical concepts, historical facts central to the argument, or the author's substantive conclusions. All illustrative examples should be genuinely fresh, not merely new names. Do not add or omit nodes. Output only the complete numbered tree, without commentary.`,
  prose: `Prosify the supplied Tractatus tree: convert its entire logical content into connected, natural prose.
Render EVERY proposition, distinction, argumentative step, qualification, objection, reply, and example. Omit ZERO detail. Add ZERO fluff, padding, new claims, generic framing, or ornamental conclusions. Connect sentences only as needed to express the stated logical relations. Preserve the order and argumentative structure. Repeated identical parent statements can be expressed once, but every distinct detail must remain. Remove tree numbering. Use coherent paragraphs, not an outline. Output only the prose.`,
};

export function splitText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const paragraph = rest.lastIndexOf("\n\n", limit);
    const line = rest.lastIndexOf("\n", limit);
    const space = rest.lastIndexOf(" ", limit);
    const boundary = paragraph > limit / 2 ? paragraph + 2 : line > limit / 2 ? line + 1 : space > limit / 2 ? space + 1 : limit;
    chunks.push(rest.slice(0, boundary));
    rest = rest.slice(boundary);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function normalizeTreeLine(line: string): string {
  return line.replace(/^(\s*)(\d+(?:\.\d+)*)(\.?)(\s+)/, (_match, indent: string, number: string, _dot: string, space: string) => {
    const id = number.includes(".") ? number : `${number}.0`;
    return `${indent}${id}${space}`;
  });
}

export async function generate(
  stage: Stage,
  text: string,
  send: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const chunks = splitText(text, 24000);
  let nextRoot = 1;
  for (let i = 0; i < chunks.length; i++) {
    if (signal.aborted) return;
    send({ status: chunks.length > 1 ? `Processing section ${i + 1} of ${chunks.length} — all source sections are included.` : "OpenAI is generating…" });
    if (i > 0) send({ content: "\n\n" });
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: instructions[stage] },
      { role: "user", content: `${chunks.length > 1 ? `This is consecutive section ${i + 1} of ${chunks.length}. Process all its detail, including any unfinished argument continued from adjacent sections. ` : ""}${stage === "tree" ? `Begin root numbering at ${nextRoot}. ` : ""}\n\n${chunks[i]}` },
    ];
    let section = "";
    let pendingLine = "";
    const writeContent = (content: string) => {
      if (stage === "prose") {
        section += content;
        send({ content });
        return;
      }
      pendingLine += content;
      let newline: number;
      while ((newline = pendingLine.indexOf("\n")) >= 0) {
        const line = normalizeTreeLine(pendingLine.slice(0, newline)) + "\n";
        pendingLine = pendingLine.slice(newline + 1);
        section += line;
        send({ content: line });
      }
    };
    let complete = false;
    for (let continuation = 0; continuation < 8; continuation++) {
      const [stream] = await batchProcess([0], () => openai.chat.completions.create({
        model: "gpt-5.6-terra",
        max_completion_tokens: 8192,
        messages,
        stream: true,
      }, { signal }), { retries: 3, minTimeout: 1000, maxTimeout: 8000 });
      let finishReason: string | null = null;
      let part = "";
      for await (const event of stream) {
        if (signal.aborted) return;
        const choice = event.choices[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const content = choice?.delta?.content;
        if (content) {
          part += content;
          writeContent(content);
        }
      }
      if (!part.trim()) throw new Error("OpenAI returned no text. Please retry.");
      if (finishReason !== "length") {
        if (finishReason !== "stop") throw new Error(`OpenAI stopped unexpectedly (${finishReason ?? "unknown reason"}). Partial text is retained.`);
        complete = true;
        break;
      }
      send({ status: "Continuing the output to preserve the remaining detail…" });
      messages.push({ role: "assistant", content: part });
      messages.push({ role: "user", content: "Continue exactly where you stopped. Do not repeat any text. Complete ALL remaining details from the supplied section." });
    }
    if (pendingLine) {
      const line = normalizeTreeLine(pendingLine);
      section += line;
      send({ content: line });
    }
    if (!complete) throw new Error("Output reached the continuation limit. Partial text is retained, but this result is incomplete.");
    if (stage === "tree") {
      const roots = Array.from(section.matchAll(/^(\d+)\.0\s/gm), m => Number(m[1]));
      if (roots.length) nextRoot = Math.max(...roots) + 1;
    }
  }
  send({ done: true });
}

type Prediction = {
  completely_generated_prob?: number;
  class_probabilities?: { ai?: number };
  document_classification?: string;
  predicted_class?: string;
  result_message?: string;
};

export async function detect(text: string, signal: AbortSignal) {
  const key = process.env.GPTZERO_API_KEY;
  if (!key) throw new Error("GPTZero API key is not configured.");
  const chunks = splitText(text, 140000);
  let weighted = 0;
  let analyzed = 0;
  const labels: string[] = [];
  const messages: string[] = [];
  for (const chunk of chunks) {
    const response = await fetch("https://api.gptzero.me/v2/predict/text", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": key },
      body: JSON.stringify({ document: chunk }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    });
    const payload = await response.json() as { documents?: Prediction[]; error?: string; message?: string };
    if (!response.ok) {
      throw new Error(`GPTZero request failed (${response.status}): ${payload.message || payload.error || "check your API plan and key"}`);
    }
    const prediction = payload.documents?.[0];
    const probability = prediction?.class_probabilities?.ai ?? prediction?.completely_generated_prob;
    if (typeof probability !== "number" || !Number.isFinite(probability)) {
      throw new Error("GPTZero returned no document AI probability. No score has been fabricated.");
    }
    weighted += Math.max(0, Math.min(1, probability)) * chunk.length;
    analyzed += chunk.length;
    labels.push(prediction?.document_classification ?? prediction?.predicted_class ?? "Unspecified");
    messages.push(prediction?.result_message ?? "GPTZero document analysis");
  }
  return {
    aiProbability: weighted / analyzed,
    classification: new Set(labels).size === 1 ? labels[0]! : "Mixed section results",
    message: chunks.length === 1 ? messages[0]! : `Length-weighted estimate from ${chunks.length} GPTZero section checks. All text was analyzed.`,
    analyzedCharacters: analyzed,
    totalCharacters: text.length,
  };
}