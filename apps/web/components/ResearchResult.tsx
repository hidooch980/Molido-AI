interface Finding {
  claim: string;
  basis: 'MODEL_KNOWLEDGE' | 'ASSUMPTION';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface ResearchOutput {
  objective?: string;
  summary?: string;
  findings?: Finding[];
  assumptions?: string[];
  uncertainties?: string[];
  suggestedNextSteps?: string[];
}

const BASIS_LABEL: Record<Finding['basis'], string> = {
  MODEL_KNOWLEDGE: 'From model knowledge',
  ASSUMPTION: 'Assumption',
};

/**
 * Renders a research result.
 *
 * The labelling is the point. Every claim shows whether it came from the
 * model's training or was assumed, and the uncertainties are given equal
 * prominence rather than buried. There is no accuracy percentage and no
 * confidence score of our own invention — only what the agent actually
 * reported.
 */
export function ResearchResult({ output }: { output: Record<string, unknown> }): React.JSX.Element {
  const result = output as ResearchOutput;

  return (
    <section className="mt-8" aria-labelledby="result-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="result-heading" className="text-sm font-semibold uppercase tracking-wider text-molido-muted">
          Result
        </h2>
        <span className="rounded-full border border-molido-line px-3 py-1 text-xs text-molido-muted">
          AI-generated content
        </span>
      </div>

      {result.objective ? (
        <p className="mt-4 text-sm text-molido-muted">
          <span className="font-medium text-molido-text">Objective:</span> {result.objective}
        </p>
      ) : null}

      {result.summary ? (
        <p className="mt-4 leading-relaxed text-molido-text">{result.summary}</p>
      ) : null}

      {result.findings && result.findings.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {result.findings.map((finding, index) => (
            <li key={index} className="rounded-lg border border-molido-line bg-molido-surface p-4">
              <p className="text-sm text-molido-text">{finding.claim}</p>
              <p className="mt-2 font-mono text-xs text-molido-muted">
                {BASIS_LABEL[finding.basis] ?? finding.basis} · confidence {finding.confidence.toLowerCase()}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {result.assumptions && result.assumptions.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-molido-text">Assumptions made</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-molido-muted">
            {result.assumptions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.uncertainties && result.uncertainties.length > 0 ? (
        <div className="mt-6 rounded-lg border border-molido-warn/40 bg-molido-warn/5 p-4">
          <h3 className="text-sm font-semibold text-molido-warn">Some of this needs verification</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-molido-warn/90">
            {result.uncertainties.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.suggestedNextSteps && result.suggestedNextSteps.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-molido-text">Suggested next steps</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-molido-muted">
            {result.suggestedNextSteps.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-8 text-xs text-molido-muted">
        This agent cannot browse the web or read documents. It works from model knowledge only, and
        it does not cite sources it could not verify.
      </p>
    </section>
  );
}
