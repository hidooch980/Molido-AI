import { z } from 'zod';
import { AI_ERROR_CODE, AIProviderError } from '../errors';
import type { AIProvider } from '../types';
import type { Agent, AgentContext, AgentResult } from './agent.types';

/**
 * The shape the model must return.
 *
 * Validation is not cosmetic here: it is the mechanism that stops a fluent but
 * malformed answer from being persisted as a result. A response that fails this
 * schema fails the task.
 */
const researchOutputSchema = z.object({
  objective: z.string().min(1).max(1000),
  summary: z.string().min(1).max(4000),
  findings: z
    .array(
      z.object({
        claim: z.string().min(1).max(1000),
        // Every claim is explicitly one or the other. An unlabelled assertion
        // is exactly the thing that makes AI output untrustworthy.
        basis: z.enum(['MODEL_KNOWLEDGE', 'ASSUMPTION']),
        confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      }),
    )
    .max(20),
  assumptions: z.array(z.string().max(1000)).max(20),
  uncertainties: z.array(z.string().max(1000)).max(20),
  suggestedNextSteps: z.array(z.string().max(500)).max(10),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

const SCHEMA_DESCRIPTION = `{
  "objective": string,
  "summary": string,
  "findings": [{ "claim": string, "basis": "MODEL_KNOWLEDGE" | "ASSUMPTION", "confidence": "HIGH" | "MEDIUM" | "LOW" }],
  "assumptions": string[],
  "uncertainties": string[],
  "suggestedNextSteps": string[]
}`;

/**
 * The system prompt is a capability statement, not a personality.
 *
 * The agent has no browsing tool, so it is told plainly that it has none and
 * must not imply otherwise. "Never fabricate sources" is enforced structurally:
 * the output schema has no `sources` field at all, so there is nowhere for an
 * invented citation to go. When real retrieval is added, the field and the
 * capability arrive together.
 */
const SYSTEM_PROMPT = `You are the MOLIDO AI Research Agent.

You have NO ability to browse the web, read files, run code, or access any
private data. Your only input is the user's goal and your own training.

Rules you must follow:
- Never claim to have looked something up, visited a page, or read a document.
- Never invent a citation, URL, study, statistic, or quotation.
- Label every finding: "MODEL_KNOWLEDGE" for things you know from training,
  "ASSUMPTION" for anything you inferred or filled in.
- State what you are uncertain about in "uncertainties". An empty list means you
  are genuinely confident; say so only when that is true.
- If the goal is too vague to answer well, say so in "uncertainties" and put the
  clarifying questions in "suggestedNextSteps".
- Prefer being useful and honest over sounding comprehensive.`;

/**
 * Framework-free on purpose: the agent lives in `@molido/ai-core` so the API
 * and the queue worker run the *same* implementation. An agent duplicated
 * across two processes is an agent that will eventually behave differently in
 * each.
 */
export class ResearchAgent implements Agent {
  readonly key = 'research';

  async execute(provider: AIProvider, context: AgentContext): Promise<AgentResult> {
    const temperature = readNumber(context.configuration['temperature'], 0.2);

    const response = await provider.generateStructuredOutput<ResearchOutput>({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Research goal:\n${context.goal}` },
      ],
      temperature,
      maxOutputTokens: context.maxOutputTokens,
      schemaDescription: SCHEMA_DESCRIPTION,
      signal: context.signal,
      parse: (value) => researchOutputSchema.parse(value),
    });

    const output = response.data;

    // A second, independent check on the model's honesty: a claim marked as
    // model knowledge that reads like a citation is rejected rather than shown
    // to the user as a fact.
    const fabricated = output.findings.find(
      (finding) => finding.basis === 'MODEL_KNOWLEDGE' && looksLikeCitation(finding.claim),
    );
    if (fabricated) {
      throw new AIProviderError({
        code: AI_ERROR_CODE.INVALID_OUTPUT,
        message:
          'The agent produced what appears to be a citation, but it has no ability to verify sources.',
        provider: provider.name,
        retryable: false,
      });
    }

    return {
      output: output as unknown as Record<string, unknown>,
      tokensUsed: response.usage.totalTokens,
    };
  }
}

/** Heuristic: URLs and "according to <source>" phrasing the agent cannot back up. */
function looksLikeCitation(claim: string): boolean {
  return /https?:\/\/|\bdoi:|\baccording to (a|the) (study|report|paper)\b/i.test(claim);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
