import { Button } from "@/components/Button";
import { brand } from "@/brand.config";

export default function NotFound() {
  return (
    <div className="bg-sol-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-sol-ink font-black text-5xl sm:text-6xl leading-tight tracking-tight">
          Page not found
        </h1>
        <p className="text-sol-muted text-lg sm:text-xl font-medium mt-5">
          We could not find the page you are looking for.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button href="/" variant="primary">
            Go to homepage
          </Button>
          <Button href="/produkter" variant="dark">
            {brand.uiLabels.notFoundProductsLink}
          </Button>
        </div>
      </div>
    </div>
  );
}
