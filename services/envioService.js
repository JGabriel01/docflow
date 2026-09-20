async function enviarLink(processo, canal) {
  if (!["EMAIL", "WHATSAPP"].includes(canal)) throw new Error("CANAL_INVALIDO");
  const contato =
    canal === "EMAIL" ? processo.cliente.email : processo.cliente.telefone;
  if (!contato) throw new Error("CONTATO_AUSENTE");
  const baseUrl = process.env.APP_BASE_URL || "";
  return { canal, contato, link: `${baseUrl}/upload/${processo.tokenAcesso}` };
}

module.exports = { enviarLink };
