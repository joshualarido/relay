export default function Loading() {
  return <div className="page stack" role="status" aria-label="Loading workspace"><div className="skeleton w-48" /><div className="skeleton w-72" /><div className="skeleton h-48" /><span className="sr-only">Loading workspace...</span></div>;
}
