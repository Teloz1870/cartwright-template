function ProductCardSkeleton() {
  return (
    <div className="block overflow-hidden rounded-2xl bg-sol-cream shadow-sm">
      <div className="aspect-square bg-sol-sun/20" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-3 w-20 rounded-full bg-sol-ink/10" />
        <div className="h-4 w-4/5 rounded-full bg-sol-ink/10" />
        <div className="h-4 w-24 rounded-full bg-sol-accent/20" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="bg-sol-accent w-full py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="h-12 w-full max-w-sm rounded-full bg-sol-cream/40" />
          <div className="mt-3 h-6 w-32 rounded-full bg-sol-cream/30" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
