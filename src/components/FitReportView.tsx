import type { FitCategory, FitReport } from '../types/fit';
import { CATEGORY_LABELS } from '../types/fit';
import { scoreColor } from '../utils/scoreColor';

interface FitReportViewProps {
  report: FitReport;
}

export function FitReportView({ report }: FitReportViewProps) {
  const categoryEntries = Object.entries(report.categories) as [
    FitCategory,
    FitReport['categories'][FitCategory],
  ][];

  return (
    <div className="fit__report">
      <div className="fit__score">
        <span className="fit__score-num">{report.overall_score}</span>
        <span className="fit__score-den">/10</span>
      </div>

      <div className="fit__categories">
        {categoryEntries.map(([key, category]) => (
          <div className="fit__category" key={key} data-tier={scoreColor(category.score)}>
            <span className="fit__dot" aria-hidden="true" />
            <span className="fit__category-label">{CATEGORY_LABELS[key]}</span>
            <span className="fit__category-score">{category.score}/10</span>
            <span className="fit__category-rationale">{category.rationale}</span>
          </div>
        ))}
      </div>

      {report.gaps.length > 0 && (
        <div className="fit__gaps">
          <h3 className="fit__section-title">Gaps</h3>
          <ul>
            {report.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      <blockquote className="fit__pitch">{report.tailored_pitch}</blockquote>
    </div>
  );
}
