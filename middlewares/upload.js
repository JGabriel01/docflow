const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const allowedMimes = [
  'application/pdf',
  'image/jpeg',
  'image/pjpeg',
  'image/png',
];

const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (allowedExtensions.includes(ext) && allowedMimes.includes(mime)) {
    cb(null, true);
  } else {
    const error = new Error('Formato de arquivo não permitido. Envie PDF, JPG ou PNG.');
    error.code = 'INVALID_FILE_FORMAT';
    error.statusCode = 400;
    cb(error, false);
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter,
});

module.exports = upload;
