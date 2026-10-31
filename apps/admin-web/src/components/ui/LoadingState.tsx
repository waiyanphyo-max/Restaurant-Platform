export function LoadingState({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="loading-placeholder" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => <div className="skeleton skeleton-row" key={index} />)}
      </div>
    </div>
  );
}
