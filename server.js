const express = require('express');
const path = require('path');
const geminiHandler = require('./api/gemini');
const feedbackHandler = require('./api/feedback');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

app.all('/api/gemini', async (req, res) => {
  try {
    await geminiHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
  }
});

app.all('/api/feedback', async (req, res) => {
  try {
    await feedbackHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Career AI server running on http://${HOST}:${PORT}`);
});
