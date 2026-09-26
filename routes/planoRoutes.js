const express = require('express');
const planoController = require('../controllers/planoController');
const requireAuth = require('../middlewares/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', planoController.renderPlanos);
router.get('/checkout', planoController.renderCheckout);
router.post('/checkout', planoController.processarPagamento);
router.post('/cancelar', planoController.cancelarPlano);

module.exports = router;
