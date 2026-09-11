export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:gap-16">
          <div className="aspect-square rounded-2xl bg-sol-sun/20" />

          <div className="flex flex-col gap-5">
            <div className="h-4 w-24 rounded-full bg-sol-ink/10" />
            <div className="space-y-3">
              <div className="h-12 w-full rounded-full bg-sol-ink/10" />
              <div className="h-12 w-4/5 rounded-full bg-sol-ink/10" />
            </div>
            <div className="h-9 w-36 rounded-full bg-sol-accent/20" />
            <div className="space-y-3">
              <div className="h-4 w-full rounded-full bg-sol-ink/10" />
              <div className="h-4 w-11/12 rounded-full bg-sol-ink/10" />
              <div className="h-4 w-2/3 rounded-full bg-sol-ink/10" />
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-sol-ink/10 pt-5">
              <div className="h-4 w-24 rounded-full bg-sol-ink/10" />
              <div className="h-4 w-28 rounded-full bg-sol-ink/10" />
              <div className="h-4 w-20 rounded-full bg-sol-ink/10" />
              <div className="h-4 w-24 rounded-full bg-sol-ink/10" />
              <div className="h-4 w-20 rounded-full bg-sol-ink/10" />
              <div className="h-4 w-24 rounded-full bg-sol-ink/10" />
            </div>
            <div className="h-4 w-20 rounded-full bg-sol-sun/20" />
            <div className="h-12 w-full max-w-sm rounded-full bg-sol-accent/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
