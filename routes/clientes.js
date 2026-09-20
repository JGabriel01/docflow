const express = require("express");
const controller = require("../controllers/clienteController");
const { requireAuth } = require("../middlewares/auth");
const { body } = require("express-validator");
const { collectValidationErrors } = require("../middlewares/validation");
const router = express.Router();
router.use(requireAuth);
const clienteValidation = [
  body("nome").trim().notEmpty().withMessage("Informe o nome.").bail().isLength({ max: 150 }).withMessage("O nome deve ter até 150 caracteres."),
  body("cpf").trim().isLength({ min: 1, max: 14 }).withMessage("O CPF deve ter até 14 caracteres."),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("Informe um e-mail válido.").bail().isLength({ max: 255 }).withMessage("O e-mail deve ter até 255 caracteres."),
  body("telefone").optional({ values: "falsy" }).isLength({ max: 20 }).withMessage("O telefone deve ter até 20 caracteres."),
];
router.get("/", controller.lista);
router.get("/novo", controller.novoForm);
router.post(
  "/novo",
  [...clienteValidation, collectValidationErrors],
  controller.novo,
);
router.get("/:id/editar", controller.editarForm);
router.post(
  "/:id/editar",
  [...clienteValidation, collectValidationErrors],
  controller.editar,
);
router.post("/:id/excluir", controller.excluir);
router.get("/:id/historico", controller.historico);
module.exports = router;
