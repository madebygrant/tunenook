import { cancelJob, dismissJob, useJob } from "../lib/job";
import { Button } from "./ui";

export function JobPanel() {
  const job = useJob();
  if (!job) return null;
  const { progress } = job;
  return (
    <div className="xh-panel job" role="status">
      <h2 className="h3">{job.label}</h2>
      {job.running && progress && (
        <>
          <div className="prog">
            <span>
              {progress.done} of {progress.total}
            </span>
            <div className="xh-track">
              <div className="fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
          <p className="subtle job-file">{progress.current}</p>
        </>
      )}
      {job.running && !progress && <p className="subtle">Starting…</p>}
      {job.result && <p>{job.result}</p>}
      {job.error && <p className="error-text">{job.error}</p>}
      <div className="dialog-actions">
        {job.running ? (
          <Button variant="secondary" onClick={cancelJob}>
            Stop
          </Button>
        ) : (
          <Button variant="ghost" onClick={dismissJob}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
