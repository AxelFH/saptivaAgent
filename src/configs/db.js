const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: "159.223.100.31",
  user: "vulcan",
  password: "$Vulcanics24.",
  database: "saptibank",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
