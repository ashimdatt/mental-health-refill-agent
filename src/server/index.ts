import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Mental health refill agent demo listening on http://localhost:${PORT}`);
  console.log(`Patient UI:  http://localhost:${PORT}/patient/`);
  console.log(`Review UI:   http://localhost:${PORT}/review/`);
});
