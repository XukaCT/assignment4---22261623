const express = require('express');
const cors = require('cors');
const { openDatabase, DB_PATH } = require('./db');
const runsRouter = require('./routes/runs');

const PORT = process.env.PORT || 3000;
const db = openDatabase();
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => res.json({ message: 'Autonomous Supermarket API is running' }));
app.use('/api', runsRouter(db));

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (database: ${DB_PATH})`);
});
