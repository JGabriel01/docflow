const express = require("express");
const controller = require("../controllers/empresaController");
const { requireAuth } = require("../middlewares/auth");
const { body } = require("express-validator");
const { collectValidationErrors } = require("../middlewares/validation");
const router = express.Router();
const empresaValidation = [
  body("razaoSocial").trim().notEmpty().withMessage("Informe a razão social.").bail().isLength({ max: 150 }).withMessage("A razão social deve ter até 150 caracteres."),
  body("cnpj").trim().isLength({ min: 1, max: 18 }).withMessage("O CNPJ deve ter até 18 caracteres."),
  body("email").isEmail().withMessage("Informe um e-mail válido.").bail().isLength({ max: 255 }).withMessage("O e-mail deve ter até 255 caracteres."),
];
router.get("/cadastro", controller.cadastroForm);
router.post(
  "/cadastro",
  [
    ...empresaValidation,
    body("senha")
      .isLength({ min: 8, max: 255 })
      .withMessage("A senha deve ter pelo menos 8 caracteres."),
    collectValidationErrors,
  ],
  controller.cadastro,
);
router.get("/perfil", requireAuth, controller.perfilForm);
router.post(
  "/perfil",
  requireAuth,
  empresaValidation.concat([
    body("senha")
      .optional({ values: "falsy" })
      .isLength({ min: 8, max: 255 })
      .withMessage("A senha deve ter pelo menos 8 caracteres."),
    collectValidationErrors,
  ]),
  controller.perfil,
);
router.post("/excluir", requireAuth, controller.excluir);
module.exports = router;
