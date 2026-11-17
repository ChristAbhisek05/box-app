// db.js
// Simple file-based database. Data is stored in db.json
// No need to install MySQL/PostgreSQL - good for learning & small projects.

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

// Default structure
db.defaults({ users: [], boxes: [], files: [] }).write();

module.exports = db;
