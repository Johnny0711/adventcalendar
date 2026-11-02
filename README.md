# A little December magic

A private, mobile-first Advent calendar for 24 printed chocolate-door QR codes. React, TypeScript, Vite, Tailwind, React Router, Fastify, and SQLite run from one application container. No accounts, cloud services, analytics, external fonts, or public private-media directory.

The calendar opens directly onto an illustrated blue winter house with 24 numbered doors. A successful QR scan still redirects to the clean `/day/:day` route: the frontend first shows the whole house, waits for server authorization, opens that specific door, then enters the day's content. Previously unlocked doors glow and can be revisited from the house. Each content page has “Back to the house” navigation. Locked/future/invalid states appear over the house without opening a door or displaying private content. Reduced-motion preferences skip the animation and enter authorized content immediately. All illustration assets are local SVG/CSS; no external design service is required at runtime.

## Quick start

Use Node.js 24 LTS and npm. From this directory:

```sh
npm ci
cp .env.example .env
npm run db:init
npm run qr:generate
npm run dev
```

Open `http://localhost:5173`. Open `generated-private/printable/index.html` locally and scan a code, or use a URL from `generated-private/qr-links.json`. A phone cannot reach your computer's `localhost`: for LAN testing, use an appropriate LAN origin and run Vite with `npm run dev:client -- --host 0.0.0.0` alongside `npm run dev:server`. The API is proxied through Vite. Development cookies are intentionally HTTP-compatible. Never expose the development servers publicly. Production enforces HTTPS origins and Secure cookies.

Initialization copies 24 editable placeholders into `private/content` only where no file exists. It creates media directories and keys for missing days. It never rotates an existing or revoked key. Run management commands one at a time. The server does not automatically create QR secrets on startup; initialize before opening the calendar.

## Commands

| Command                                     | Purpose                                             |
| ------------------------------------------- | --------------------------------------------------- |
| `npm ci`                                    | Install the locked dependencies                     |
| `npm run dev`                               | Run Fastify and Vite                                |
| `npm run dev:server` / `npm run dev:client` | Run either independently                            |
| `npm run db:init`                           | Initialize SQLite, keys, and placeholder content    |
| `npm run qr:generate`                       | Generate local SVG/PNG codes and A4 print sheet     |
| `npm run key:revoke -- 7 --confirm`         | Disable day 7 and erase its session grants          |
| `npm run key:rotate -- 7 --confirm`         | Replace day 7's secret and erase its session grants |
| `npm run db:backup`                         | Create a consistent SQLite online backup            |
| `npm test`                                  | Run security and behavior tests                     |
| `npm run typecheck` / `npm run lint`        | Check TypeScript and lint                           |
| `npm run build` / `npm start`               | Build and serve the production frontend and API     |
| `npm run docker:up`                         | Build and start Compose                             |

`npm start` uses the environment in `.env`; set `NODE_ENV=production` and an HTTPS origin for real deployment. Node 24's built-in SQLite avoids native addon compilation. It may emit an experimental-feature warning on some Node 24 releases.

## Structure

```text
src/                 React UI and responsive styles (public)
server/              configuration, schema, authentication, protected routes
scripts/manage.ts    initialization, QR generation, revocation, backups
tests/               backend security, deployment, and house-interaction tests
content-examples/    harmless, committed placeholders for all 24 days
private/content/     your edited JSON, ignored by Git and Docker context
private/media/01/    private media for day 1 (through 24)
data/                SQLite database and WAL files, ignored
generated-private/   credential vault, QR files, URLs, printable sheet, ignored
deploy/Caddyfile     host Caddy example
```

## Configuration

Copy `.env.example`; never commit `.env`. CLI commands load it too. In Docker the container paths are fixed by the Dockerfile, and Compose explicitly passes deployment settings.

| Variable             | Default / meaning                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`           | `development`; production enables Secure cookies, HSTS, HTTPS validation                                      |
| `PUBLIC_ORIGIN`      | `http://localhost:5173`; exact origin with no trailing slash, path, or credentials; production must use HTTPS |
| `PORT`               | `3000`                                                                                                        |
| `CALENDAR_YEAR`      | `2026`                                                                                                        |
| `TIMEZONE`           | `Europe/Bucharest`; validated IANA timezone                                                                   |
| `DATE_LOCK`          | `false` locally; set **true** for production; only `true`/`false` accepted                                    |
| `SESSION_EXPIRES_AT` | End of January following the configured year, UTC; example explicitly sets `2027-02-01T00:00:00Z`             |
| `DATA_DIR`           | `./data`                                                                                                      |
| `CONTENT_DIR`        | `./private/content`                                                                                           |
| `MEDIA_DIR`          | `./private/media`                                                                                             |
| `OUTPUT_DIR`         | `./generated-private`                                                                                         |
| `TRUST_PROXY`        | Empty by default; comma-separated **actual proxy IPs/CIDRs** when needed for client-IP rate limiting          |
| `QR_MM`              | `30`; QR matrix including quiet zone, 20–45 mm allowed for the A4 layout                                      |
| `QR_ECC`             | `M`; QR error correction `L`, `M`, `Q`, `H`                                                                   |

Session expiry is absolute, not sliding. Adjust it when reusing the app for a later season. If it is in the past, new scans return 503 instead of creating unusable sessions. Do not change the year while existing printed codes are in use without considering their continuing access.

## Write the surprises

Edit `private/content/01.json` through `24.json`. Changes appear on the next request; no database migration or rebuild is needed. The server strictly validates JSON before delivery. UTF-8 with or without BOM is supported. Example:

```json
{
  "day": 1,
  "title": "A little surprise",
  "blocks": [
    { "type": "text", "content": "Write your personal message here." },
    { "type": "letter", "content": "A longer note.\n\nWith paragraphs." },
    { "type": "image", "src": "memory.webp", "alt": "Describe your photo" },
    { "type": "video", "src": "message.mp4", "caption": "A small hello" },
    { "type": "audio", "src": "hello.mp3", "caption": "Press play" },
    { "type": "file", "src": "invitation.pdf", "label": "Your invitation" },
    {
      "type": "quiz",
      "question": "Choose a little treat",
      "options": ["Chocolate", "More chocolate"],
      "answer": 1,
      "explanation": "A very sweet choice."
    }
  ]
}
```

Put corresponding files in `private/media/01/`. Repeat image blocks for a gallery. Allowed filenames contain ASCII letters, digits, `_` and `-`, with one lowercase extension: `webp`, `png`, `jpg`, `jpeg`, `gif`, `mp4`, `webm`, `mp3`, `m4a`, `ogg`, `wav`, `pdf`. No paths, URLs, HTML, SVG or executable files. Media must be explicitly referenced by that day's content. Directory realpaths are checked to reject symlink escapes. Only trusted operators may write private storage; do not change symlinks while requests run.

Use WebP/JPEG at sensible mobile resolutions, MP4 with H.264/AAC for broad iPhone support, and compressed audio. Videos/audio use authenticated byte-range streaming and metadata preload. Images lazy-load. Provide good alt text. Quiz answers are delivered to an authorized browser along with the question; this is a personal interaction, not a cheat-resistant examination. Choices are local component state and are not saved or sent anywhere. No raw HTML or Markdown execution is supported.

## QR generation and printing

Set `PUBLIC_ORIGIN` to the permanent public HTTPS origin **before final printing**. Run initialization and QR generation against the **same database** that will run in production. Generating unrelated keys on a laptop and a server will produce incompatible codes.

`generated-private/token-vault.json` is the only recovery copy of the original 256-bit Base64URL secrets. SQLite stores SHA-256 hashes only. The vault, links, images, and print sheet are credentials: keep them offline/private, use restrictive filesystem permissions, and include them only in encrypted backups. Never upload them to public storage, serve this directory, or commit them. The Docker build context excludes all private runtime directories. PNG files contain the matrix only; labeled SVG files and the print sheet carry day numbers beneath the quiet zone.

Open the generated print sheet locally and print on A4 at **100% / actual size**, margins controlled by the sheet, with browser headers/footers disabled. It uses four columns by six rows and dashed cut lines. At the default 30 mm matrix size it fits on one A4 sheet. The SVG includes an extra label below the matrix. Do not crop the white quiet zones. Print on matte white material, test every code on the actual paper and phone before hiding them, and increase the dimensions if the domain makes the codes too dense. Error correction is configurable; do not add logos inside the matrix. Browser and printer settings can affect final size.

To rotate a compromised key, first back up the database and credential vault, run `key:rotate -- DAY --confirm`, then `qr:generate` and replace the affected physical code. Other printed codes stay valid. Rotation removes existing grants for that day, so devices must rescan. Revocation immediately blocks existing grants and future scans. A revoked day causes generation of the full sheet to fail until it is explicitly rotated. Generation never silently re-enables it. If the vault is lost, the database cannot recover original secrets: restore the matching vault or explicitly rotate affected days. An origin change requires new QR images but does not require new secrets.

## Authentication and security model

Anyone holding a valid QR URL can unlock that day on any device. Tokens are deliberately **reusable**. This capability model cannot identify your girlfriend or stop her from sharing a link, saving content, taking screenshots, or using a shared device. Each day has an independent random 32-byte secret; brute forcing an unknown secret is infeasible.

`GET /open/:day/:token` validates shape, hashes the token, compares it with the enabled day's stored hash using a timing-safe comparison, rotates the opaque session ID, copies existing grants, records the new day, invalidates the previous ID, sets an HTTP-only SameSite=Lax cookie, and returns 303 to the clean day URL. No HTML or third-party resource loads on this route. Invalid/revoked codes redirect to `/invalid` without granting access. A pre-release valid scan remembers permission but never returns content before the server's release date.

Session IDs also use 32 random bytes; only their hashes are stored in SQLite. Cookies use Path `/`, absolute expiry, and a `__Host-` prefix in production. Private requests check expiry, the session/day grant, enabled status, and date independently. Multiple devices have independent sessions. Rotation during a scan prevents session fixation; simultaneous scans in separate tabs may replace an older cookie, so scan sequentially if collecting several days. Expired records are cleaned on startup and hourly. There are foreign keys, WAL mode, a busy timeout, indexed expiry, and schema initialization with `user_version=1`.

`/api/unlocked` returns only day numbers and release availability, plus calendar year. `/api/days/:day` and `/api/media/:day/:filename` enforce authorization server-side. `/day/:day` is a public application shell containing no private content. Knowing that route or a direct media URL grants nothing. All private responses use `Cache-Control: no-store`; public compiled assets use immutable year-long caching. There is no service worker or localStorage authentication. No unnecessary CORS is enabled. CSP, no-referrer, nosniff, frame restrictions, production HSTS, limited request bodies, and generic errors are applied. Authentication has a per-client 30/minute limit.

The app deliberately has request logging disabled, including URL/error logging. It emits only startup messages. **Also disable raw URL logging at every proxy, load balancer, monitoring tool, and browser debugging collector**: the `/open` path is a credential. Browsers and scanner apps may retain the original link in history; no server header can guarantee its removal. Keep devices secure. Don't put token URLs into issue reports or terminal recordings.

Date locks compare the server instant to December's date in `TIMEZONE`, including year. Each day opens at local midnight; all past dates remain available to sessions with that grant. Keep the Ubuntu host clock synchronized. Setting `DATE_LOCK=false` bypasses only the date check, never QR authorization. The browser clock is never authoritative.

## Ubuntu Docker deployment

Install Docker Engine and the Compose plugin using the official Ubuntu installation instructions. Configure DNS for your domain to your public address and arrange router/host access to your HTTPS proxy on 443 (and 80 if needed for ACME). For IPv6, check both A and AAAA routing. These host/network changes are intentionally manual. If behind CGNAT you need an incoming connectivity solution; this project does not configure one.

```sh
cp .env.example .env
# Edit .env:
# NODE_ENV=production
# PUBLIC_ORIGIN=https://advent.yourdomain.com
# DATE_LOCK=true
# SESSION_EXPIRES_AT=2027-02-01T00:00:00Z
docker compose build
docker compose run --rm advent node dist/scripts/manage.js init
docker compose run --rm advent node dist/scripts/manage.js qr
docker compose up -d
curl http://127.0.0.1:3000/health
```

The image runs as UID/GID 1000 (`node`), drops Linux capabilities, uses a read-only root filesystem, has an HTTP health check, and stores SQLite, private content/media, generated artifacts, and backups in separate named volumes. There is **no database port**. The only application port is bound to host loopback. Do not use `docker compose down -v` unless intentionally destroying your private state.

Export the print assets for offline printing and inspect/edit content:

```sh
docker compose cp advent:/app/generated-private ./generated-private
docker compose cp advent:/app/private ./private
# After editing a day locally:
docker compose cp ./private/content/01.json advent:/app/private/content/01.json
docker compose cp ./private/media/01/memory.webp advent:/app/private/media/01/memory.webp
```

`compose cp` requires a created/running service container; run `up -d` first. Keep copied files private. Check ownership/readability as UID 1000 after copying; use `docker compose exec --user root advent chown -R node:node /app/private` if necessary. This changes container volume ownership, not host firewall or DNS. For initialization after a service exists, `docker compose exec advent node dist/scripts/manage.js init` also works. For production management use `node dist/scripts/manage.js COMMAND`, not npm's development `tsx` commands (dev dependencies are pruned).

### Existing Cloudflare Tunnel (no published application port)

Use `docker-compose.cloudflare.yml` instead of the default Compose file when `cloudflared` already runs in Docker. This configuration publishes no host port. Find the tunnel container's existing networks:

```sh
docker inspect cloudflared-tunnel --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

Choose an existing user-defined bridge network from that list (not Docker's built-in `bridge`, `host`, or `none`). Add these lines to `.env`, alongside the production settings:

```dotenv
COMPOSE_FILE=docker-compose.cloudflare.yml
TUNNEL_NETWORK=replace-with-existing-tunnel-network
```

Run the same `docker compose build`, initialization, QR generation, and `up -d` commands above. Compose automatically selects the Cloudflare file through `COMPOSE_FILE`. In the existing tunnel's published application routes, add your calendar hostname (for example `advent.johnnyco.tech`) with service type **HTTP** and URL **advent-calendar:3000**. The full origin service is `http://advent-calendar:3000`; do not use `localhost`, which would refer to the tunnel container. Public access still uses `https://advent.johnnyco.tech`. No extra Caddy/Nginx container or router port forwarding is needed. Leave the other application routes unchanged. If the tunnel uses a local ingress configuration, add the same hostname/service mapping before its final catch-all route.

Keep `TRUST_PROXY` empty initially: the authentication limit then aggregates at the tunnel container's IP. If per-client limits are needed, configure only the verified proxy IP/CIDR; do not trust arbitrary `CF-Connecting-IP` headers from directly reachable clients.

The application sends `Cache-Control: no-store` for private responses; Origin Cache Control is enabled by default on Cloudflare Free, Pro, and Business plans. No Enterprise upgrade is needed. An optional hostname Cache Rule with cache eligibility **Bypass cache** is also available on Free. Ensure no conflicting rule or Worker overrides the private response headers. Disable optional analytics/session recording for the calendar and avoid raw request-URL logging or debug logging in the tunnel, Workers, and log exports. Cloudflare terminates public TLS and can therefore see the QR credentials and private responses: this deployment uses your chosen Cloudflare infrastructure and is not end-to-end encrypted from browser to the application. Browser/scanner history can also retain QR URLs.

Check the container with `docker compose ps` and the public endpoint with `curl -fsS https://YOUR-CALENDAR-HOST/health`. The host-loopback curl command from the default deployment does not apply to this configuration. Copy generated assets and private content using the same `docker compose cp` commands above. Set the permanent HTTPS hostname before generating the final codes, using the same production database.

### Caddy

`deploy/Caddyfile` assumes Caddy installed **on the host**. Supply `ADVENT_DOMAIN=advent.yourdomain.com` to the Caddy service environment, install the example site block, validate and reload Caddy. It proxies to `127.0.0.1:3000` and obtains certificates. Do not enable Caddy's `log` directive for this site. If a global logging configuration includes requests, exclude this site or redact the entire request URI, including error logs.

### Existing Nginx Proxy Manager / Traefik

If NPM is a container, its `127.0.0.1` is not the host. Connect `advent` to the proxy's existing external Docker network via a Compose override; then forward HTTP to `advent:3000` and remove the `ports` entry if unused. Use an HTTPS proxy host for your domain, request a certificate, and force SSL. Do not publish 3000 to a public host interface. Traefik can use the same shared-network service and TLS router approach.

For NPM, disable access logging for this host/location (`access_log off;`) and ensure custom/global logs and error collectors do not retain request URIs. Nginx error logs may include original request URLs; use `error_log /dev/null crit;` for this dedicated vhost if you cannot reliably redact them. NPM versions/templates vary: inspect `nginx -T` to verify the **effective** server and location configuration, including generated error log directives. Back up the proxy config before changes. Do not add duplicate conflicting directives blindly in the Advanced field. Verify with an innocuous fake `/open/01/TEST` request and inspect log destinations. The app's safe logging does not protect upstream proxy logs.

Set `TRUST_PROXY` to the actual immediate proxy IP or dedicated network CIDR if you want rate limits per device. Never trust all internet addresses; ensure clients cannot connect directly to the app port. With no proxy trust, limits aggregate by proxy IP, which is secure but may throttle two devices together. HTTPS security comes from production configuration, not an untrusted forwarded protocol header. Preserve the Host and forwarded client-IP headers at the proxy.

## Updating an existing server deployment

Code updates do not replace the named volumes. Your database (including keys, sessions, and grants), private content/media, generated QR files, and backups survive container replacement. Keep using the same checkout directory, Compose project name, and volume configuration. Do not regenerate keys, remove volumes, or run initialization/QR generation for ordinary code updates. New committed placeholder examples do not overwrite your private messages. New environment variables or incompatible schema changes may still require release-specific instructions.

On Ubuntu, after pushing changes from your development machine, run:

```sh
cd ~/homeserver/adventcalendar
bash scripts/update.sh
```

No host Node/npm installation is needed. The wrapper refuses tracked local changes, performs `git pull --ff-only`, and deploys even if Git reports no new commits (useful after a failed build). It respects `COMPOSE_FILE` in your `.env`, including the Cloudflare configuration. Docker permissions, Bash, `flock` (Ubuntu's `util-linux`), and a current Docker Compose plugin supporting `up --wait --wait-timeout` are required.

Deployment validates Compose settings and acquires a lock, builds the image while the old container keeps serving, creates an online SQLite backup using the running container, then runs `compose up` with `--no-build --remove-orphans --wait`. The new container must pass its health check within 180 seconds; override with an exported `ADVENT_DEPLOY_TIMEOUT` in seconds if needed. Container replacement causes a brief interruption; it is not a zero-downtime deployment. Initial setup must be completed before using the update script. Avoid concurrent pulls, manual Compose operations, or content/key changes during deployment.

Build or backup failures abort before replacement. Health-check failures produce an explicit error and retain the previous image and all volumes, but **do not automatically roll back the checkout, container, or database**. Fix the reported issue and rerun `bash scripts/deploy.sh` (without another pull), or use the backup/restore procedure for an incompatible schema change. Do not assume that old code can read a newer database schema.

Only containers belonging to this Compose project and no longer defined in its configuration are removed as orphans. Use a dedicated project name; never reuse another application's `COMPOSE_PROJECT_NAME`. After successful deployment, the script tries to remove only the exact previous calendar image ID, without forcing removal. If another tag/container still references it, it stays. There is no global `docker system prune`, image prune, build-cache purge, volume removal, or modification to Cloudflare/Nextcloud/other projects. Build cache and accumulated backups are deliberately retained; manage those separately according to your backup policy.

### Optional: deploy automatically after `git pull`

Install this only in the **server checkout**, not on the development computer:

```sh
cd ~/homeserver/adventcalendar
bash scripts/install-deploy-hook.sh
```

The installer creates a local executable Git hook that calls the tracked `.githooks/post-merge` template, and sets repository-local pulls to fast-forward only with rebase disabled. Tracked file modes stay unchanged, so installation does not dirty the checkout. Other default Git hooks remain active. It refuses to overwrite an existing custom post-merge hook or configured hooks directory. From then on:

```sh
git pull
```

A pull that fast-forwards/merges new commits triggers the deployment. An unchanged pull does not trigger Git's post-merge hook; use `bash scripts/update.sh` for retries or a guaranteed rebuild. The hook also runs after manual merges; avoid manually merging unreviewed code on the deployment checkout. The update wrapper suppresses the hook to prevent double deployment. Git hooks are local configuration and are not activated merely by cloning or pulling the repository.

A post-merge error cannot undo the completed Git update, and Git may still report a successful pull; check the hook's **AUTO-DEPLOY FAILED** message and deployment result. Only pull trusted code, since the opt-in hook executes it with your user's Docker permissions. To disable the optional hook:

```sh
bash scripts/install-deploy-hook.sh --disable
```

This leaves the fast-forward-only Git pull settings in place. To reset those too, unset the local `pull.ff` and `pull.rebase` settings. No host-level Git settings are modified. You can always use `bash scripts/deploy.sh` to rebuild/deploy the currently checked-out code without pulling.

## Backup and restore

Back up the database, edited private files, and generated token vault/QR artifacts together. Encrypt backups and restrict access; both the vault and sessions are sensitive. Do not copy just a live `.sqlite` file in WAL mode: recent commits may be in `-wal`.

For a consistent online database snapshot:

```sh
npm run db:backup
# Or in Docker:
docker compose exec advent node dist/scripts/manage.js backup
docker compose cp advent:/app/backups ./backups
```

This uses SQLite's online backup API, including committed WAL data. To capture matching content and credential artifacts, avoid editing/rotating during the backup. For the simplest full backup, stop the app and management commands, then archive the four named volumes with a trusted local backup tool. Preserve ownership and permissions. Never run two application writers during restore.

Restore with the service stopped: replace `data/advent.sqlite` with the online backup, remove any **stale WAL/SHM files belonging to the replaced database**, restore the matching private files and vault, preserve UID/GID 1000, and restart. For named volumes use a temporary trusted maintenance container mounting the volumes, or restore your full volume archives. Validate `/health`, scan a known QR and test media. Restoring old sessions may restore still-valid browser grants; explicitly revoke/rotate a compromised day after restoration. Backup paths are private and never served by the app.

## Verification and troubleshooting

```sh
npm test
npm run typecheck
npm run lint
npm run build
docker build -t private-advent .
```

Tests cover valid/invalid/wrong-day/revoked/reused tokens, independent devices, multiple-day grants, fixation defense, anonymous day/media denial, direct navigation, expiry, early scans, timezone boundaries, unique/idempotent initialization, media ranges, path traversal, private file exposure, content validation, QR artifacts, and rate limiting. Symlink tests run where the OS grants symlink permissions. Build the frontend before rerunning tests to additionally exercise the production shell/static setup.

- **Invalid QR:** confirm database and vault match, the day is enabled, and the URL uses the current domain. Old codes stop working after rotation.
- **Locked after a scan:** cookies must be enabled and the same hostname used. Production cookies require HTTPS. A new device must scan its own code.
- **Not yet:** check server time, year, timezone, and `DATE_LOCK`. It cannot be overridden from the browser.
- **503 on scan:** session season has ended; set a future expiry and restart.
- **500 on content:** check valid JSON, correct `day`, existing files, and permitted schema; errors intentionally don't disclose private paths or stack traces.
- **429:** wait a minute. Check trusted-proxy settings if all devices share a rate-limit bucket.
- **No audio/video:** check codecs, content filename references, and file ownership. Authenticated byte ranges are supported.
- **Docker startup error:** set an HTTPS `PUBLIC_ORIGIN` in `.env`; verify volume permissions and the Docker daemon. `docker compose config` shows effective deployment configuration without printing token secrets.
- **Private edits missing in Docker:** local private files are intentionally excluded from the image. Copy them into the private volume.

Dependencies are pinned in `package-lock.json`. Patched `glob` and `minimatch` overrides address transitive dependency advisories; review and remove these overrides when upstream dependencies adopt patched releases. Review updates and `npm audit` regularly; rebuild and rerun checks after upgrades. Use `npm run format` and `npm run format:check` for consistent source formatting. Larger QR dimensions may span multiple A4 sheets. Production readiness still requires real domain/TLS configuration, physical print testing, encrypted backups, and operational care of your homelab.
