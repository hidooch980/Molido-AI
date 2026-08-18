import type { AIProvider } from '../types';

/** What the orchestrator hands an agent. Nothing more is in scope. */
export interface AgentContext {
  taskId: string;
  goal: string;
  /** Non-secret runtime settings from the agent's database row. */
  configuration: Record<string, unknown>;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface AgentResult {
  /** Validated structured output, persisted as the task's result. */
  output: Record<string, unknown>;
  tokensUsed: number;
}

/**
 * The capability contract for an agent.
 *
 * Note the shape of the dependency: an agent receives an `AIProvider` and a
 * context object, and returns data. It is handed no database client, no
 * filesystem, no shell, no HTTP client and no credentials — so "the agent must
 * not have unrestricted access" is enforced by what it is possible to write,
 * not by a rule someone has to remember.
 */
export interface Agent {
  readonly key: string;
  execute(provider: AIProvider, context: AgentContext): Promise<AgentResult>;
}
