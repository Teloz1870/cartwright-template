-- SEO/GEO Autopilot (Track K, Pro). Snapshots (søge-perf + GEO-citation) +
-- selvforbedrings-eksperimenter (genome-felt-ændring m. keep/revert). Additivt
-- (kun nye tabeller). Hand-written for konsistens med øvrige migrations.

CREATE TABLE "SeoSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "page" TEXT,
    "query" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "position" REAL,
    "ctr" REAL
);
CREATE INDEX "SeoSnapshot_capturedAt_idx" ON "SeoSnapshot"("capturedAt");

CREATE TABLE "GeoSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engine" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "cited" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT
);
CREATE INDEX "GeoSnapshot_capturedAt_idx" ON "GeoSnapshot"("capturedAt");

CREATE TABLE "SeoExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fieldKey" TEXT NOT NULL,
    "beforeValue" TEXT,
    "afterValue" TEXT NOT NULL,
    "baselineJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluatedAt" DATETIME,
    "resultNote" TEXT
);
CREATE INDEX "SeoExperiment_status_idx" ON "SeoExperiment"("status");
