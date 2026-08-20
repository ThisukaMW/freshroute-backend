import multer from 'multer'
import path from 'path'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import cloudinary from '../config/cloudinary.config.js'

// Files go straight to Cloudinary instead of local disk — Render's
// filesystem is ephemeral and wipes local uploads on every redeploy.
const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: 'freshroute',
    resource_type: 'auto',
  }),
})

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowed = /jpeg|jpg|png|webp|gif|pdf/
  const ext = allowed.test(path.extname(file.originalname).toLowerCase())
  const mime = allowed.test(file.mimetype)
  if (ext && mime) {
    cb(null, true)
  } else {
    const err: any = new Error('Only images (jpg, png, webp, gif) and PDFs are allowed')
    err.statusCode = 400
    cb(err)
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter,
})
