const express = require("express");
const controller = require("../controllers/uploadController");
const upload = require("../middlewares/upload");
const { requireAuth } = require("../middlewares/auth");
const router = express.Router();
router.get("/documentos/:id/download", requireAuth, controller.baixar);
router.get("/:token", controller.tela);
router.post("/:token", async (req, res, next) => {
	const processo = await require("../services/processoService").obterProcessoPublico(req.params.token);
	if (!processo) return res.status(404).render("link-invalido", { title: "Link inválido" });
	next();
}, upload.single("arquivo"), controller.enviar);
module.exports = router;
