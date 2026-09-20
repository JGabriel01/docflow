const express = require("express");
const controller = require("../controllers/uploadController");
const upload = require("../middlewares/upload");
const router = express.Router();
router.get("/:token", controller.tela);
router.post("/:token", upload.single("arquivo"), controller.enviar);
module.exports = router;
