const express = require("express");
const controller = require("../controllers/clienteController");
const { requireAuth } = require("../middlewares/auth");
const { body } = require("express-validator");
const { collectValidationErrors } = require("../middlewares/validation");
const router = express.Router();
router.use(requireAuth);
const clienteValidation = [
  body("nome").trim().notEmpty().withMessage("Informe o nome."),
  body("cpf").trim().notEmpty().withMessage("Informe o CPF."),
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
