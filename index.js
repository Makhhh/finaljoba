const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const pool = require('./db');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authenticateToken = require('./authMiddleware'); 
const usersRoutes = require("./routes/usersRoutes");
const supportRoutes = require("./routes/supportRoutes");

const app = express();
const PORT = 5000;

const corsOptions = {
  origin: ['https://finaljoba.onrender.com'], 
  credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));


app.use("/api/users", usersRoutes);
app.use("/api/support", supportRoutes);



app.post('/upload-face',  async (req, res) => {
  const { email, imageData } = req.body;

  if (!email || !imageData) {
    return res.status(400).json({ error: 'email және фото қажет' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET face_image = $1 WHERE email = $2 RETURNING *',
      [imageData, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ message: 'Фото успешно сохранено ✅' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

app.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Қолданушы табылмады' });
    }

    const user = result.rows[0];
    res.json({
      email: user.email,
      username: user.username,
      face_image: user.face_image
    });
  } catch (err) {
    console.error('❌ Профиль қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});


app.post('/compare-face', async (req, res) => {
  const { email, imageData } = req.body;

  if (!email || !imageData) {
    return res.status(400).json({ message: '❌ Email және фото қажет' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '❌ Қолданушы табылмады' });
    }

    const user = result.rows[0];
    if (!user.face_image) {
      return res.status(400).json({ message: '❌ Бұл қолданушыда Face ID тіркелмеген' });
    }

    const cleanSavedImage = user.face_image.replace(/^data:image\/\w+;base64,/, '');
    const cleanCapturedImage = imageData.replace(/^data:image\/\w+;base64,/, '');

    const body = new URLSearchParams();
    body.append('api_key', process.env.FACEPP_API_KEY);
    body.append('api_secret', process.env.FACEPP_API_SECRET);
    body.append('image_base64_1', cleanSavedImage);
    body.append('image_base64_2', cleanCapturedImage);

    const faceRes = await fetch('https://api-us.faceplusplus.com/facepp/v3/compare', {
      method: 'POST',
      body,
    });

    const faceData = await faceRes.json();

    if (faceData.confidence && faceData.confidence > 70) {
      await pool.query(
      "INSERT INTO logins (user_id, method, user_agent) VALUES ($1, $2, $3)",
      [req.user.id, 'faceid', req.headers['user-agent']]
    );
      return res.json({ message: '✅ Face ID сәйкестігі расталды' });

    } else {
      return res.status(401).json({ message: '❌ Face ID сәйкес келмеді' });
    }

  } catch (err) {
    console.error('❌ Face++ немесе сервер қатесі:', err);
    res.status(500).json({ message: '❌ Сервер немесе Face++ қатесі' });
  }
});


app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Барлық өрістер қажет' });
  }

  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Бұл email тіркелген' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hashedPassword]
    );

    res.status(201).json({
      message: 'Тіркеу сәтті өтті ✅',
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email
      }
    });
  } catch (err) {
    console.error('❌ SQL қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});


app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email және пароль қажет' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email немесе пароль' });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    await pool.query(
      "INSERT INTO logins (user_id, method, user_agent) VALUES ($1, $2, $3)",
      [user.id, 'password', req.headers['user-agent']]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      message: 'Кіру сәтті өтті ✅',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        face_image: user.face_image
      }
    });

  } catch (err) {
    console.error('❌ Login қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Қолданушы табылмады' });

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      face_image: user.face_image,
      token: req.headers.authorization.split(' ')[1]
    });
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

app.put('/api/users/update-name', authenticateToken, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Аты қажет' });

  try {
    const result = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING *',
      [username, req.user.id]
    );

    const updatedUser = result.rows[0];
    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      face_image: updatedUser.face_image,
      token: req.headers.authorization.split(' ')[1]
    });
  } catch (err) {
    res.status(500).json({ error: 'Атын жаңарту қатесі' });
  }
});

app.put('/api/users/delete-face', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET face_image = NULL WHERE id = $1 RETURNING *',
      [req.user.id]
    );
    const updatedUser = result.rows[0];
    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      face_image: null,
      token: req.headers.authorization.split(' ')[1]
    });
  } catch (err) {
    res.status(500).json({ error: 'Жою қатесі' });
  }
});
 
app.get('/api/users/logins', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT method, timestamp, user_agent FROM logins WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 10',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Журнал логинов қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});



app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Получение users қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
