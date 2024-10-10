const express = require("express");
const path = require("path");
const router = express.Router();

// Serve custom three.meshline.js file
router.use("/three.meshline", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/dist/custom.three.meshline.js"));
});
router.use("/socket/socket.io", (req, res) => {
  res.sendFile(path.join(__dirname, "../../../node_modules/socket.io/client-dist/socket.io.esm.min.js"));
});

// Serve three addons
router.use(
  "/three/addons",
  express.static(path.join(__dirname, "../../../node_modules/three/examples/jsm/"))
);
router.use(
  "/socket",
  express.static(path.join(__dirname, "../../../node_modules/socket.io/client-dist/"))
);
router.use(
  "/three/",
  express.static(path.join(__dirname, "../../../node_modules/three/"))
);

// Serve static files from the public folder
router.use(express.static(path.join(__dirname, "../../public")));

// Serve index.html as the default route
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/index.html"));
});

module.exports = router;
