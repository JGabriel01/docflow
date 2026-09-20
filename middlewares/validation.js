const { validationResult } = require("express-validator");

function collectValidationErrors(req, res, next) {
  const result = validationResult(req);
  req.validationErrors = Object.fromEntries(
    result.array().map((error) => [error.path, error.msg]),
  );
  next();
}

module.exports = { collectValidationErrors };
