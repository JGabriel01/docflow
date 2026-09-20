const express = require("express");
const controller = require("../controllers/processoController");
const { requireAuth } = require("../middlewares/auth");
const { body } = require("express-validator");
const { collectValidationErrors } = require("../middlewares/validation");
const router = express.Router();
router.use(requireAuth);
const documentosValidos = body("documentos").custom((value) => {
  const nomes = [].concat(value ?? [])
    .flatMap((item) => String(item).split(/\r?\n/))
    .map((nome) => nome.trim())
    .filter(Boolean);
  if (!nomes.length)
    throw new Error("Informe ao menos um documento.");
  if (nomes.some((nome) => nome.length > 100))
    throw new Error("Cada documento deve ter até 100 caracteres.");
  return true;
});
const processoValidation = [
  body("clienteId").isInt({ min: 1 }).withMessage("Selecione um cliente."),
  body("nomeProcesso")
    .trim()
    .notEmpty()
    .withMessage("Informe o nome do processo.")
    .bail()
    .isLength({ max: 150 })
    .withMessage("O nome do processo deve ter até 150 caracteres."),
  documentosValidos,
];
router.get("/", controller.lista);
router.get("/novo", controller.novoForm);
router.post(
  "/novo",
  [...processoValidation, collectValidationErrors],
  controller.novo,
);
router.get("/:id", controller.detalhe);
router.get("/:id/editar", controller.editarForm);
router.post(
  "/:id/editar",
  [
    body("nomeProcesso")
      .trim()
      .notEmpty()
      .withMessage("Informe o nome do processo.")
      .bail()
      .isLength({ max: 150 })
      .withMessage("O nome do processo deve ter até 150 caracteres."),
    documentosValidos,
    collectValidationErrors,
  ],
  controller.editar,
);
router.post("/:id/excluir", controller.excluir);
router.post("/:id/enviar-link", controller.enviarLink);
module.exports = router;
