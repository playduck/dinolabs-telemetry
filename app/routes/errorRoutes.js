const express = require("express");
const router = express.Router();

// Error handling middleware
router.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal Server Error");
});

module.exports = router;
