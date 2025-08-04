const pool = require("../db");

const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, email, username, face_image FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Пайдаланушы табылмады" });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      faceImage: user.face_image,
      faceId: !!user.face_image, 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Сервер қатесі" });
  }
};

module.exports = { getUserProfile };
