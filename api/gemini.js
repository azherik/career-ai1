// Файл: api/gemini.js
// Серверный прокси для безопасного обращения к Google Gemini API

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

const ALLOWED_MODELS = new Set([
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
]);

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 15;

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }
  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    return true;
  }
  record.count += 1;
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается. Используйте POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'На сервере не настроен GEMINI_API_KEY. Добавьте его в настройках Vercel.',
    });
  }

  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: 'Слишком много запросов подряд. Подождите 1 минуту и попробуйте снова.',
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    if (JSON.stringify(body).length > 65000) {
      return res.status(413).json({
        error: 'Текст резюме или вакансии слишком большой. Сократите объём текста.',
      });
    }

    if (!body.contents || !Array.isArray(body.contents)) {
      return res.status(400).json({
        error: 'Некорректный формат запроса: отсутствует поле contents.',
      });
    }

    const requestedModel = String(body.model || DEFAULT_MODEL).replace(/^models\//, '').trim();
    const safeModel = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

    const googleUrl = `${GEMINI_API_BASE}/models/${encodeURIComponent(safeModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const upstreamResponse = await fetch(googleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: body.systemInstruction,
        contents: body.contents,
        generationConfig: body.generationConfig,
      }),
    });

    const responseData = await upstreamResponse.json();
    return res.status(upstreamResponse.status).json(responseData);
  } catch (error) {
    return res.status(502).json({
      error: `Ошибка соединения с сервером Google Gemini: ${error.message || 'Неизвестная ошибка'}`,
    });
  }
};
