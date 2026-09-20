const express = require("express");
const controller = require("../controllers/processoController");
const { requireAuth } = require("../middlewares/auth");
const { body } = require("express-validator");
const { collectValidationErrors } = require("../middlewares/validation");
const router = express.Router();
router.use(requireAuth);
const processoValidation = [
  body("clienteId").isInt({ min: 1 }).withMessage("Selecione um cliente."),
  body("nomeProcesso")
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage("O nome do processo deve ter até 150 caracteres."),
  body("documentos").custom((value) => {
    const items = Array.isArray(value) ? value : [value];
    if (
      !items.some(
        (item) => item && item.split(/\r?\n/).some((name) => name.trim().length <= 100),
      )
    )
      throw new Error("Informe ao menos um documento.");
    return true;
  }),
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
      .isLength({ min: 1, max: 150 })
      .withMessage("O nome do processo deve ter até 150 caracteres."),
    body("documentos").custom((value) => {
      const items = Array.isArray(value) ? value : [value];
      if (
        !items.some(
          (item) => item && item.split(/\r?\n/).some((name) => name.trim()),
        )
      )
        throw new Error("Informe ao menos um documento.");
      return true;
    }),
    collectValidationErrors,
  ],
  controller.editar,
);
router.post("/:id/excluir", controller.excluir);
router.post("/:id/enviar-link", controller.enviarLink);
module.exports = router;
