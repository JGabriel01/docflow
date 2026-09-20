require("dotenv").config();
const app = require("./app");
const { enviarLembretesPendentes } = require("./services/lembreteService");
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`DocFlow em http://localhost:${port}`));
enviarLembretesPendentes().catch((error) =>
  console.error("Falha ao processar lembretes:", error),
);
setInterval(
  () =>
    enviarLembretesPendentes().catch((error) =>
      console.error("Falha ao processar lembretes:", error),
    ),
  24 * 60 * 60 * 1000,
);
