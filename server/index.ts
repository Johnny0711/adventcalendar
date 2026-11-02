import { buildApp } from './app.js';
import { config } from './config.js';
process.umask(0o077);
const c = config();
const app = await buildApp(c);
try {
  await app.listen({ port: c.PORT, host: '0.0.0.0' });
  console.info(`Advent listening on port ${c.PORT}`);
} catch {
  console.error('Server could not start');
  process.exit(1);
}
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
