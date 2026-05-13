require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.post("/upload-cover", upload.single("cover"), async (req, res) => {
  try {
    const { UTApi, UTFile } = await import("uploadthing/server");

    if (!req.file) {
      return res.status(400).json({ error: "No cover file uploaded." });
    }

    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed." });
    }

    const utapi = new UTApi({
      token: process.env.UPLOADTHING_TOKEN,
    });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");

    const file = new UTFile([req.file.buffer], safeName, {
      type: req.file.mimetype,
    });

    const result = await utapi.uploadFiles(file);

    const uploaded = result?.data || result;

    if (!uploaded?.url) {
      return res.status(500).json({ error: "UploadThing did not return a URL." });
    }

    res.json({
      success: true,
      url: uploaded.url,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Cover upload failed." });
  }
});

app.listen(3000, () => {
  console.log("Upload server running on port 3000");
});
