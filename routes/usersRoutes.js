const express = require("express");
const router = express.Router();
const authenticateToken = require("../authMiddleware");
const pool = require("../db");

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Қолданушы табылмады" });
    }
    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      face_image: user.face_image,
    });
  } catch (err) {
    console.error("❌ /me қатесі:", err);
    res.status(500).json({ error: "Сервер қатесі" });
  }
});


router.put("/me", authenticateToken, async (req, res) => {
  const { username } = req.body;
  try {
    const result = await pool.query(
      "UPDATE users SET username = $1 WHERE id = $2 RETURNING id, email, username, face_image",
      [username, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ PUT /me қатесі:", err);
    res.status(500).json({ error: "Сервер қатесі" });
  }
});


router.delete("/face", authenticateToken, async (req, res) => {
  try {
    await pool.query("UPDATE users SET face_image = NULL WHERE id = $1", [req.user.id]);
    res.json({ message: "Face ID жойылды ✅" });
  } catch (err) {
    console.error("❌ DELETE /face қатесі:", err);
    res.status(500).json({ error: "Сервер қатесі" });
  }
});

module.exports = router;
