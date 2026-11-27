// Файл: api/feedback.js
// Серверный маршрут для безопасной отправки анонимных отзывов о качестве блоков в Google Форму

const GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScfyOG3NBTIaOl6Czu_Aok7AG_ZSQMhZexB8imCOZvSK1qZLg/formResponse';

const ALLOWED_BLOCKS = new Set([
  'Анализ навыков',
  'Улучшение резюме',
  'План развития',
  'Тренажёр собеседования',
]);

const ALLOWED_RATINGS = new Set(['Полезно', 'Не точно']);

const MAX_COMMENT_LENGTH = 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 20;
const rateLimitMap = new Map();

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

  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: 'Слишком много запросов подряд. Подождите минуту и попробуйте снова.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON в теле запроса.' });
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Ожидается JSON-объект с отзывом.' });
  }

  if (typeof body.block !== 'string') {
    return res.status(400).json({ error: 'Поле block обязательно и должно быть строкой.' });
  }
  const block = body.block.trim();
  if (!block || block.length > 100 || !ALLOWED_BLOCKS.has(block)) {
    return res.status(400).json({ error: 'Недопустимое значение поля block.' });
  }

  if (typeof body.rating !== 'string') {
    return res.status(400).json({ error: 'Поле rating обязательно и должно быть строкой.' });
  }
  const rating = body.rating.trim();
  if (!rating || rating.length > 50 || !ALLOWED_RATINGS.has(rating)) {
    return res.status(400).json({ error: 'Недопустимое значение поля rating.' });
  }

  let comment = '';
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== 'string') {
      return res.status(400).json({ error: 'Поле comment должно быть строкой.' });
    }
    comment = body.comment.trim();
    if (comment.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({
        error: `Комментарий не должен превышать ${MAX_COMMENT_LENGTH} символов.`,
      });
    }
  }

  try {
    const formParams = new URLSearchParams();
    formParams.set('entry.1487439502', block);
    formParams.set('entry.1286542735', rating);
    formParams.set('entry.602582333', comment);

    const upstreamResponse = await fetch(GOOGLE_FORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: formParams.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!upstreamResponse.ok) {
      return res.status(502).json({
        error: 'Не удалось отправить, попробуйте ещё раз',
      });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({
      error: 'Не удалось отправить, попробуйте ещё раз',
    });
  }
};
