const nodemailer = require("nodemailer");
const twilio = require("twilio");

function configurado(canal) {
  if (canal === "EMAIL")
    return Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM,
    );
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM,
  );
}

async function enviar({ canal, contato, link, assunto = "Seu link DocFlow" }) {
  if (!configurado(canal)) throw new Error("ENVIO_NAO_CONFIGURADO");
  if (canal === "EMAIL") {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: contato,
      subject: assunto,
      text: `Acesse seu checklist DocFlow: ${link}`,
    });
    return;
  }
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );
  await client.messages.create({
    from: process.env.TWILIO_FROM,
    to: contato,
    body: `Acesse seu checklist DocFlow: ${link}`,
  });
}

module.exports = { configurado, enviar };
