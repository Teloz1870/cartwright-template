# Moving from WooCommerce

The migration board at `/admin/migration` (runtime flag `migrationDashboard`) lists every check a
move from a WordPress/WooCommerce shop has to pass before the DNS switch, and the
`migration.run_checks` tool runs them. `pnpm woo:import` brings the old shop's categories and
products into this catalogue. Most of what both read from the old shop is public — its Store API
(`wc/store/v1`) and `wp/v2` — and needs no key. One read is not.

## The WooCommerce read key

**What it is.** A read-only WooCommerce REST API key for the old shop, in two variables:

| Variable | Holds |
|---|---|
| `WOO_AUTH_USER` | the key's consumer key (or a WordPress user name) |
| `WOO_AUTH_PASS` | the key's consumer secret (or that user's application password) |

Create a read-only REST API key in the old shop's WooCommerce admin; read access is all it needs.
The key is sent as HTTP Basic auth, over https only, and only to the shop's `wc/v3` API — never to
its Store API or `wp/v2`. Set both variables or neither: one without the other is an error, never
read as "no key".

**What needs it.** Of the checks the board runs, only **`data.stock`** ("Every product keeps its
stock policy") reads with the key: it compares each imported product's stock policy, and a counted
product's exact count, with the old shop's `wc/v3` answer. Every other check, `data.counts` and
`data.prices` included, runs without it. `pnpm woo:import` needs the key too: without it a
preview does not check a new product's stock, and `--apply` with products in scope stops before
anything is read or written (`--scope categories` needs no key).

**Where to set it.** Where the code that reads it runs:

- **For the board:** where the site runs. On Vercel, add both variables to the project's environment
  and redeploy, because Vercel gives a changed variable only to new deployments; when you run
  the site yourself, put them in `.env.local`. A key in your own shell does not reach the site.
- **For `pnpm woo:import`:** the shell you run it from, or the project's `.env.local` / `.env`,
  which the script loads (`.env.local` wins).

**Without it.** `data.stock` is **inconclusive**, never a pass and never a fail, and its detail
says the site has no read key and names both variables. A half-set key and a key the shop refuses
are inconclusive too, each with its own reason. Because `data.stock` is a required check, an
inconclusive run counts against "Ready for DNS switch" until it passes with the key set.

Never commit the key: `.env.example` carries both names commented out, with no value.
