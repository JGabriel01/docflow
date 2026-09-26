const express = require('express');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

router.get('/:token', uploadController.renderUpload);
router.post('/:token', uploadController.enviarDocumento);

module.exports = router;
