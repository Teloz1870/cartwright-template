import { Button } from "@/components/Button";
import { brand } from "@/brand.config";

export default function NotFound() {
  return (
    <div className="bg-sol-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-sol-ink font-black text-5xl sm:text-6xl leading-tight tracking-tight">
          Siden blev ikke fundet
        </h1>
        <p className="text-sol-muted text-lg sm:text-xl font-medium mt-5">
          Vi kunne ikke finde den side, du leder efter.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button href="/" variant="primary">
            Til forsiden
          </Button>
          <Button href="/produkter" variant="dark">
            {brand.uiLabels.notFoundProductsLink}
          </Button>
        </div>
      </div>
    </div>
  );
}
