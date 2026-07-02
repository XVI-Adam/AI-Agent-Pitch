import { useState, useCallback } from 'react';
import { useFitRater } from '../hooks/useFitRater';
import { FitReportView } from './FitReportView';

const MAX_JD_LENGTH = 3_000;

export function FitPanel() {
  const [value, setValue] = useState('');
  const { rateFit, isLoading, report, error, retry, dismissError } = useFitRater();

  const handleSubmit = useCallback(() => {
    rateFit(value);
  }, [rateFit, value]);

  return (
    <div className="scroll">
      <div className="fit">
        <div className="empty fit__intro">
          <span className="empty__kicker">JD Fit Rater</span>
          <h2 className="empty__head">
            Paste a job description. <em>Get a calibrated fit score.</em>
          </h2>
          <p className="empty__body">
            Scored against Adam&apos;s actual stack, experience, and working style — honest gaps
            included, not just a pitch.
          </p>
        </div>

        <div
          className="composer fit__composer"
          data-error={error?.kind === 'validation' ? 'true' : 'false'}
        >
          <textarea
            className="composer__field fit__textarea"
            placeholder="Paste the job description here…"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_JD_LENGTH))}
            maxLength={MAX_JD_LENGTH}
            rows={8}
            aria-label="Job description"
            disabled={isLoading}
          />
          <div className="composer__bar">
            <span className="fit__char-count">
              {value.length} / {MAX_JD_LENGTH}
            </span>
            <button
              type="button"
              className="submit"
              onClick={handleSubmit}
              disabled={isLoading}
              data-streaming={isLoading ? 'true' : 'false'}
              aria-label={isLoading ? 'Analyzing job description' : 'Rate my fit'}
            >
              {isLoading ? 'Analyzing…' : 'Rate My Fit'}
              <span className="submit__arrow" aria-hidden="true">
                {isLoading ? '■' : '→'}
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="notice" role="alert">
            <span className="notice__tag">
              {error.kind === 'validation' ? 'Input' : error.kind === 'timeout' ? 'Timeout' : 'Error'}
            </span>
            <span className="notice__text">{error.message}</span>
            {error.kind !== 'validation' ? (
              <button className="notice__retry" type="button" onClick={retry}>
                Retry
              </button>
            ) : (
              <button className="notice__retry" type="button" onClick={dismissError}>
                Dismiss
              </button>
            )}
          </div>
        )}

        {report && <FitReportView report={report} />}
      </div>
    </div>
  );
}
