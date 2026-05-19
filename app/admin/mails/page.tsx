import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { requireAdmin } from "@/lib/admin";

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
      <div>
        <h1 className="text-3xl font-black text-sol-ink">E-mail previews</h1>
        <p className="mt-2 text-sm font-semibold text-sol-muted">
          Genererede ordrebekræftelser — afsendes ikke i demoen.
        </p>
      </div>

      {mails.length === 0 ? (
        <section className="rounded-2xl border border-sol-ink/10 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-sol-muted">
            Ingen preview-mails endnu — gennemfør et køb for at generere en.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {mails.map((mail) => (
            <details
              key={mail.filename}
              className="rounded-2xl border border-sol-ink/10 bg-white p-5 shadow-sm"
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
