import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { requireAdmin } from "@/lib/admin";
import { AdminPageHeader } from "@/components/admin/ui";

export default async function AdminMailsPage() {
  await requireAdmin();

  const previewDir = join(process.cwd(), ".mail-previews");

  let filenames: string[] = [];

  try {
    filenames = await readdir(previewDir);
  } catch {
    filenames = [];
  }

  const mails = await Promise.all(
    filenames
      .filter((filename) => filename.endsWith(".html"))
      .sort()
      .reverse()
      .map(async (filename) => ({
        filename,
        html: await readFile(join(previewDir, filename), "utf-8"),
      })),
  );

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        title="E-mail previews"
        subtitle="Generated order confirmations - not sent in the demo."
      />

      {mails.length === 0 ? (
        <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm">
          <p className="text-sm font-semibold text-sol-muted">
            No preview emails yet - complete a purchase to generate one.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {mails.map((mail) => (
            <details
              key={mail.filename}
              className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-5 shadow-sm"
            >
              <summary className="cursor-pointer text-sm font-black text-sol-ink">
                {mail.filename}
              </summary>
              <iframe
                srcDoc={mail.html}
                className="mt-4 h-96 w-full rounded-lg border border-sol-ink/10"
              />
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
