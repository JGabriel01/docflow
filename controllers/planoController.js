const planoService = require('../services/planoService');

class PlanoController {
  async renderPlanos(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const empresa = await planoService.obterPlanoEmpresa(empresaId);
      const planos = planoService.obterTabelaPlanos();

      // Sincronizar sessão
      req.session.empresa.plano = empresa.plano;

      return res.render('planos/index', {
        title: 'Planos e Assinatura - DocFlow',
        empresa,
        planos,
      });
    } catch (err) {
      return next(err);
    }
  }

  async renderCheckout(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const empresa = await planoService.obterPlanoEmpresa(empresaId);

      if (empresa.plano === 'PRO') {
        req.flash('info', 'Sua empresa já possui o Plano Pro ativo!');
        return res.redirect('/planos');
      }

      // Gerar código Pix Copia e Cola simulado formatado
      const pixCodigo = `00020126580014br.gov.bcb.pix0136${Math.random().toString(36).substring(2, 15)}-docflow520400005303986540529.905802BR5916DOCFLOW SOLUCOES6009SAO PAULO62070503***6304ABCD`;

      return res.render('planos/checkout', {
        title: 'Contratar Plano Pro - DocFlow',
        empresa,
        preco: 'R$ 29,90',
        pixCodigo,
        errors: {},
      });
    } catch (err) {
      return next(err);
    }
  }

  async processarPagamento(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const { metodoPagamento, numeroCartao, nomeCartao, validade, cvv } = req.body;

      try {
        const resultado = await planoService.realizarUpgrade(empresaId, {
          metodoPagamento,
          detalhesCartao: {
            numeroCartao,
            nomeCartao,
            validade,
            cvv,
          },
        });

        req.session.empresa.plano = 'PRO';

        req.flash(
          'success',
          'Pagamento de R$ 29,90 aprovado! O Plano Pro foi ativado com sucesso. Agora você tem acesso ao Histórico e Lembretes automáticos!'
        );
        return res.redirect('/processos');
      } catch (serviceErr) {
        if (serviceErr.statusCode === 400) {
          const empresa = await planoService.obterPlanoEmpresa(empresaId);
          const pixCodigo = `00020126580014br.gov.bcb.pix0136${Math.random().toString(36).substring(2, 15)}-docflow520400005303986540529.905802BR5916DOCFLOW SOLUCOES6009SAO PAULO62070503***6304ABCD`;

          return res.status(200).render('planos/checkout', {
            title: 'Contratar Plano Pro - DocFlow',
            empresa,
            preco: 'R$ 29,90',
            pixCodigo,
            errors: { cartao: serviceErr.message },
          });
        }
        throw serviceErr;
      }
    } catch (err) {
      return next(err);
    }
  }

  async cancelarPlano(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      await planoService.cancelarPlanoPro(empresaId);

      req.session.empresa.plano = 'GRATIS';
      req.flash('info', 'Sua assinatura foi alterada para o Plano Grátis.');
      return res.redirect('/planos');
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new PlanoController();
