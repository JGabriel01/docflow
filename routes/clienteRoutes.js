const express = require('express');
const { body } = require('express-validator');
const clienteController = require('../controllers/clienteController');
const requireAuth = require('../middlewares/requireAuth');

const router = express.Router();

const validacaoCliente = [
  body('nome')
    .trim()
    .notEmpty()
    .withMessage('O nome do cliente é obrigatório.'),
  body('cpf')
    .trim()
    .notEmpty()
    .withMessage('O CPF é obrigatório.'),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Informe um e-mail válido se preenchido.'),
  body('telefone')
    .optional({ checkFalsy: true })
    .trim(),
];

// Todas as rotas de clientes exigem autenticação
router.use(requireAuth);

router.get('/', clienteController.listar);
router.get('/novo', clienteController.renderNovo);
router.post('/novo', validacaoCliente, clienteController.cadastrar);
router.get('/:id/editar', clienteController.renderEditar);
router.post('/:id/editar', validacaoCliente, clienteController.atualizar);
router.post('/:id/excluir', clienteController.excluir);
router.get('/:id/historico', clienteController.historico);

module.exports = router;
