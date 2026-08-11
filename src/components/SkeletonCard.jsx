export default function SkeletonCard({ count = 1, className = "" }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={"rounded-2xl border border-border bg-card overflow-hidden " + className}>
          <div className="aspect-[4/3] skeleton-shimmer" />
          <div className="p-3 space-y-2">
            <div className="h-4 w-3/4 rounded skeleton-shimmer" />
            <div className="h-3 w-1/2 rounded skeleton-shimmer" />
            <div className="flex justify-between pt-1">
              <div className="h-5 w-16 rounded skeleton-shimmer" />
              <div className="h-3 w-12 rounded skeleton-shimmer" />
            </div>
            <div className="h-3 w-full rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
    </>
  );
}