import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

const app = buildApp();
app.listen({ port, host }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
