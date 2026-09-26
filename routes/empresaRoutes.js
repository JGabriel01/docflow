const express = require('express');
const { body } = require('express-validator');
const empresaController = require('../controllers/empresaController');
const requireAuth = require('../middlewares/requireAuth');

const router = express.Router();

const validacaoCadastro = [
  body('razaoSocial')
    .trim()
    .notEmpty()
    .withMessage('A Razão Social é obrigatória.'),
  body('cnpj')
    .trim()
    .notEmpty()
    .withMessage('O CNPJ é obrigatório.'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Informe um e-mail válido.'),
  body('senha')
    .notEmpty()
    .withMessage('A senha é obrigatória.')
    .isLength({ min: 6 })
    .withMessage('A senha deve ter no mínimo 6 caracteres.'),
];

const validacaoPerfil = [
  body('razaoSocial')
    .trim()
    .notEmpty()
    .withMessage('A Razão Social é obrigatória.'),
  body('cnpj')
    .trim()
    .notEmpty()
    .withMessage('O CNPJ é obrigatório.'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Informe um e-mail válido.'),
  body('senha')
    .optional({ checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage('A senha deve ter no mínimo 6 caracteres se for informada.'),
];

// Rotas públicas
router.get('/cadastro', empresaController.renderCadastro);
router.post('/cadastro', validacaoCadastro, empresaController.cadastrar);

// Rotas autenticadas
router.get('/perfil', requireAuth, empresaController.renderPerfil);
router.post('/perfil', requireAuth, validacaoPerfil, empresaController.atualizarPerfil);
router.post('/excluir', requireAuth, empresaController.excluir);

module.exports = router;
