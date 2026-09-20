const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "storage", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});
const fileFilter = (req, file, callback) => {
  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  const extension = path.extname(file.originalname).toLowerCase();
  const extensions = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
  callback(null, allowed.includes(file.mimetype) && extensions[extension] === file.mimetype);
};

function assinaturaValida(filePath, mimetype) {
  const header = fs.readFileSync(filePath).subarray(0, 8);
  if (mimetype === "application/pdf") return header.toString("ascii", 0, 5) === "%PDF-";
  if (mimetype === "image/png") return header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

const middleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

middleware.assinaturaValida = assinaturaValida;
module.exports = middleware;
