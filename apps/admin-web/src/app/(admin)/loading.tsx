export default function AdminLoading() {
  return <div role="status" aria-live="polite" className="loading-state"><span className="spinner" aria-hidden="true" /><h1>Loading your workspace</h1><p>Verifying access and retrieving platform data…</p></div>;
}
