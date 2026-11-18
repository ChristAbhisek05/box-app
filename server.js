// server.js
// "Box" - every user gets their own code notes + a mini Drive for files.
// Only ONE admin exists, and the admin can see everyone's data.

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// The one and only username that becomes admin. Change via env var if needed.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

// ---------- Uploads folder setup ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB max per file
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'box-app-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// ---------- Helper middlewares ----------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Admins only.');
  }
  next();
}

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---------- Routes ----------

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('home');
});

// ----- Register -----
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('register', { error: 'Username and password are both required.' });
  }

  const existing = db.get('users').find({ username }).value();
  if (existing) {
    return res.render('register', { error: 'This username is already taken.' });
  }

  const wantsAdmin = username === ADMIN_USERNAME;
  if (wantsAdmin) {
    const adminAlreadyExists = db.get('users').find({ role: 'admin' }).value();
    if (adminAlreadyExists) {
      return res.render('register', { error: 'An admin account already exists. Choose a different username.' });
    }
  }

  const hashed = bcrypt.hashSync(password, 10);
  const newUser = {
    id: Date.now().toString(),
    username,
    password: hashed,
    role: wantsAdmin ? 'admin' : 'user'
  };

  db.get('users').push(newUser).write();

  res.redirect('/login');
});

// ----- Login -----
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.get('users').find({ username }).value();

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { error: 'Incorrect username or password.' });
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ----- Dashboard (code boxes + drive, combined view) -----
app.get('/dashboard', requireLogin, (req, res) => {
  const myBoxes = db.get('boxes').filter({ userId: req.session.user.id }).value();
  const myFiles = db.get('files').filter({ userId: req.session.user.id }).value();
  res.render('dashboard', {
    user: req.session.user,
    boxes: myBoxes,
    files: myFiles,
    humanSize
  });
});

// ----- Code box: create -----
app.get('/box/new', requireLogin, (req, res) => {
  res.render('box-form', { user: req.session.user, box: null });
});

app.post('/box/new', requireLogin, (req, res) => {
  const { title, content } = req.body;
  db.get('boxes').push({
    id: Date.now().toString(),
    userId: req.session.user.id,
    title,
    content,
    createdAt: new Date().toISOString()
  }).write();
  res.redirect('/dashboard');
});

// ----- Code box: edit -----
app.get('/box/:id/edit', requireLogin, (req, res) => {
  const box = db.get('boxes').find({ id: req.params.id }).value();
  if (!box || box.userId !== req.session.user.id) return res.status(403).send('Access denied.');
  res.render('box-form', { user: req.session.user, box });
});

app.post('/box/:id/edit', requireLogin, (req, res) => {
  const box = db.get('boxes').find({ id: req.params.id }).value();
  if (!box || box.userId !== req.session.user.id) return res.status(403).send('Access denied.');

  db.get('boxes').find({ id: req.params.id })
    .assign({ title: req.body.title, content: req.body.content })
    .write();

  res.redirect('/dashboard');
});

// ----- Code box: delete -----
app.post('/box/:id/delete', requireLogin, (req, res) => {
  const box = db.get('boxes').find({ id: req.params.id }).value();
  if (!box || box.userId !== req.session.user.id) return res.status(403).send('Access denied.');

  db.get('boxes').remove({ id: req.params.id }).write();
  res.redirect('/dashboard');
});

// ----- Drive: upload a file (photo / document) -----
app.post('/drive/upload', requireLogin, upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/dashboard#drive');

  db.get('files').push({
    id: Date.now().toString(),
    userId: req.session.user.id,
    originalName: req.file.originalname,
    storedName: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  }).write();

  res.redirect('/dashboard#drive');
});

// ----- Drive: view / download a file -----
app.get('/drive/file/:id', requireLogin, (req, res) => {
  const file = db.get('files').find({ id: req.params.id }).value();
  if (!file) return res.status(404).send('File not found.');

  const isOwner = file.userId === req.session.user.id;
  const isAdmin = req.session.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).send('Access denied.');

  const filePath = path.join(UPLOAD_DIR, file.storedName);
  res.sendFile(filePath);
});

// ----- Drive: delete a file -----
app.post('/drive/file/:id/delete', requireLogin, (req, res) => {
  const file = db.get('files').find({ id: req.params.id }).value();
  if (!file || file.userId !== req.session.user.id) return res.status(403).send('Access denied.');

  const filePath = path.join(UPLOAD_DIR, file.storedName);
  fs.unlink(filePath, () => {}); // remove from disk, ignore errors
  db.get('files').remove({ id: req.params.id }).write();

  res.redirect('/dashboard#drive');
});

// ----- Admin panel: every user + every box + every file -----
app.get('/admin', requireLogin, requireAdmin, (req, res) => {
  const users = db.get('users').value();
  const boxes = db.get('boxes').value();
  const files = db.get('files').value();
  res.render('admin', { user: req.session.user, users, boxes, files, humanSize });
});

app.listen(PORT, () => {
  console.log(`Box app running at: http://localhost:${PORT}`);
});
