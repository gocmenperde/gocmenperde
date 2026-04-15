const express = require('express');
const path = require('path');
const router = require('./api/router');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', async (req, res) => {
  const route = req.path.replace(/^\/+|\/+$/g, '');
  req.query = { ...req.query, route };
  return router(req, res);
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
