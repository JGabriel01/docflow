const express = require('express');
const { body } = require('express-validator');
const processoController = require('../controllers/processoController');
const requireAuth = require('../middlewares/requireAuth');

const router = express.Router();

const validacaoCriacao = [
  body('clienteId')
    .notEmpty()
    .withMessage('Selecione um cliente.'),
  body('nomeProcesso')
    .trim()
    .notEmpty()
    .withMessage('O nome do processo é obrigatório.'),
  body('documentos')
    .custom((value) => {
      if (!value) {
        throw new Error('Adicione ao menos um documento na checklist.');
      }
      if (Array.isArray(value)) {
        const validDocs = value.filter((v) => typeof v === 'string' && v.trim().length > 0);
        if (validDocs.length === 0) {
          throw new Error('Adicione ao menos um documento na checklist.');
        }
      } else if (typeof value === 'string') {
        if (value.trim().length === 0) {
          throw new Error('Adicione ao menos um documento na checklist.');
        }
      }
      return true;
    }),
];

const validacaoEdicao = [
  body('nomeProcesso')
    .trim()
    .notEmpty()
    .withMessage('O nome do processo é obrigatório.'),
];

// Todas as rotas de processos exigem autenticação
router.use(requireAuth);

router.get('/', processoController.listar);
router.get('/novo', processoController.renderNovo);
router.post('/novo', validacaoCriacao, processoController.cadastrar);
router.get('/:id', processoController.detalhe);
router.get('/:id/editar', processoController.renderEditar);
router.post('/:id/editar', validacaoEdicao, processoController.atualizar);
router.post('/:id/excluir', processoController.excluir);
router.post('/:id/enviar-link', processoController.enviarLink);
router.get('/:id/documentos/:documentoId/download', processoController.downloadDocumento);

module.exports = router;
