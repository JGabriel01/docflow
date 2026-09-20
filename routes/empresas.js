const express = require("express");
const controller = require("../controllers/empresaController");
const { requireAuth } = require("../middlewares/auth");
const { body } = require("express-validator");
const { collectValidationErrors } = require("../middlewares/validation");
const router = express.Router();
const empresaValidation = [
  body("razaoSocial").trim().notEmpty().withMessage("Informe a razão social."),
  body("cnpj").trim().notEmpty().withMessage("Informe o CNPJ."),
  body("email").isEmail().withMessage("Informe um e-mail válido."),
];
router.get("/cadastro", controller.cadastroForm);
router.post(
  "/cadastro",
  [
    ...empresaValidation,
    body("senha")
      .isLength({ min: 8 })
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
      .isLength({ min: 8 })
      .withMessage("A senha deve ter pelo menos 8 caracteres."),
    collectValidationErrors,
  ]),
  controller.perfil,
);
router.post("/excluir", requireAuth, controller.excluir);
module.exports = router;
