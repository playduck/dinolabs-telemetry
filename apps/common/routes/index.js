const express = require("express");
const router = express.Router();
const staticRoutes = require("./staticRoutes");
const errorRoutes = require("./errorRoutes");

router.use(staticRoutes);
router.use(errorRoutes);

module.exports = router;
