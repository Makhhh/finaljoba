const express = require("express");
const router = express.Router();
const pool = require("../db");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const TOGETHER_API_KEY = "633846a7d487a63e8cb5706082f25c8a98e76028824381196a32906151de037b";
const TOGETHER_MODEL = "meta-llama/Llama-3-8b-chat-hf"; 

const PROMPT_TEMPLATE = `
Ты — бот поддержки сайта про регистрацию и вход через Face ID. 
Ты отвечаешь ТОЛЬКО на вопросы по теме Face ID, логина, распознавания лица и сайта. 
Сайт использует Face++ API, все данные сохраняются в базе, Face ID — дополнительный способ входа, поэтому можно просто введя пароль, код написан вручную.

Если пользователь задаёт вопрос НЕ по теме, ответь строго:
"Бұл чат тек Face ID жүйесіне қатысты сұрақтарға жауап береді. Өтініш, нақты тақырыпта сұрақ қойыңыз."

Теперь ответь на вопрос пользователя по казахский: `;


router.post("/", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Хабарлама бос болмауы керек" });
  }

  try {
    const fullPrompt = PROMPT_TEMPLATE + message;

    const response = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOGETHER_API_KEY}`,
      },
      body: JSON.stringify({
        model: TOGETHER_MODEL,
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await response.json();

    const responseText =
      data?.choices?.[0]?.message?.content || "Қате болды...";

    // Сохраняем в БД
    await pool.query(
      "INSERT INTO support_messages (message, response) VALUES ($1, $2)",
      [message, responseText]
    );

    res.json({ response: responseText });
  } catch (err) {
    console.error("❌ Support error:", err.message);
    res.status(500).json({ response: "Сервер қатесі" });
  }
});

module.exports = router;
