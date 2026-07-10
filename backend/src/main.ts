import { openDb } from "./db.js";
import { loadKey } from "./crypto.js";
import { buildServer } from "./server.js";

const app = buildServer({ db: openDb(), pickKey: loadKey() });
const port = Number(process.env.PORT ?? 8787);
app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => console.log(`acertana backend listening on ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
