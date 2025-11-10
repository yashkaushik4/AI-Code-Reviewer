require('dotenv').config();
const app = require('./src/app');

// Render dynamically provides a PORT value
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
