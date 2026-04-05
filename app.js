const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use(express.static(__dirname));

app.use('/api/auth', require('./auth'));
app.use('/api/ballots', require('./ballot'));
app.use('/api/vote', require('./vote'));
app.use('/api/results', require('./results'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  return res.status(404).json({ message: 'Not found.' });
});

module.exports = app;
