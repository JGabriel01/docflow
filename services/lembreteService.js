const prisma = require('../lib/prisma');

class LembreteService {
  /**
   * Envia um lembrete para um processo, respeitando a restrição do Plano Pro (RN-06, CB-10)
   * e idempotência/janela de verificação.
   */
  async enviarLembrete(processoId, intervaloMinimoHoras = 24) {
    const processo = await prisma.processo.findUnique({
      where: { id: Number(processoId) },
      include: {
        cliente: {
          include: {
            empresa: true,
          },
        },
        documentos: true,
        lembretes: {
          orderBy: { dataHoraEnvio: 'desc' },
          take: 1,
        },
      },
    });

    if (!processo) {
      const err = new Error('Processo não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    // RN-06 & CB-10: Exclusivo do Plano PRO
    if (processo.cliente.empresa.plano !== 'PRO') {
      const err = new Error('Lembretes automáticos são exclusivos do Plano Pro.');
      err.statusCode = 403;
      err.isPlanRestriction = true;
      throw err;
    }

    if (processo.status === 'CONCLUIDO') {
      return { enviado: false, motivo: 'Processo já está concluído.' };
    }

    // Verificar se todos os documentos já estão recebidos
    const pendentes = processo.documentos.filter((d) => d.status === 'PENDENTE');
    if (pendentes.length === 0) {
      return { enviado: false, motivo: 'Não há documentos pendentes.' };
    }

    // Idempotência na janela de verificação
    if (processo.lembretes.length > 0) {
      const ultimoEnvio = new Date(processo.lembretes[0].dataHoraEnvio).getTime();
      const agora = Date.now();
      const diferencaHoras = (agora - ultimoEnvio) / (1000 * 60 * 60);

      if (diferencaHoras < intervaloMinimoHoras) {
        return {
          enviado: false,
          motivo: `Lembrete já enviado recentemente (há menos de ${intervaloMinimoHoras}h).`,
        };
      }
    }

    // Registrar o lembrete enviado
    const lembrete = await prisma.lembreteEnviado.create({
      data: {
        processoId: processo.id,
      },
    });

    return {
      enviado: true,
      lembrete,
      cliente: processo.cliente.nome,
      contato: processo.cliente.email || processo.cliente.telefone,
    };
  }

  /**
   * Rotina periódica de verificação de processos com pendências de empresas PRO
   */
  async verificarEEnviarLembretesPendentes() {
    const processosPendentes = await prisma.processo.findMany({
      where: {
        status: 'EM_ANDAMENTO',
        cliente: {
          empresa: {
            plano: 'PRO',
            ativa: true,
          },
        },
        documentos: {
          some: {
            status: 'PENDENTE',
          },
        },
      },
    });

    const resultados = [];
    for (const processo of processosPendentes) {
      try {
        const res = await this.enviarLembrete(processo.id);
        resultados.push({ processoId: processo.id, ...res });
      } catch (e) {
        resultados.push({ processoId: processo.id, erro: e.message });
      }
    }

    return resultados;
  }
}

module.exports = new LembreteService();
