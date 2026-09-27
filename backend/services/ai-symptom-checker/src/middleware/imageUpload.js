const multer = require('multer');

/**
 * Symptom images are read once, sent to the vision model and then dropped, so
 * they are never written to disk. That removes the stored-file problems
 * entirely: no attacker-controlled filename or extension, and nothing left in
 * a directory that used to be served without authentication (V-D09, V-D16).
 */
const storage = multer.memoryStorage();

// The declared media type is the client's word, so it is only a first filter.
// The real check is the file signature test below, run on the received bytes.
const fileFilter = (_req, file, cb) => {
  if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPEG, PNG or WEBP images are accepted'));
};

const SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  {
    mime: 'image/webp',
    test: (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/**
 * Returns the media type the bytes actually are, or null when they are not one
 * of the accepted image formats. Never trusts what the request claimed.
 */
function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const match = SIGNATURES.find((signature) => signature.test(buffer));
  return match ? match.mime : null;
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8MB
});

module.exports = upload;
module.exports.sniffImageType = sniffImageType;
