// server.js
// "Box" - har user apna code/notes store kar sakta hai.
// Admin sabka data dekh sakta hai.

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Jo username yaha set karoge, wahi user register hote hi ADMIN ban jayega.
// Isko apne hisaab se change kar lena (.env me bhi daal sakte ho).
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'box-app-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 din
}));

// ---------- Helper middlewares ----------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Admin only.');
  }
  next();
}

// ---------- Routes ----------

app.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));

// ----- Register -----
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('register', { error: 'Username aur password dono zaroori hain.' });
  }

  const existing = db.get('users').find({ username }).value();
  if (existing) {
    return res.render('register', { error: 'Ye username pehle se registered hai.' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const role = username === ADMIN_USERNAME ? 'admin' : 'user';

  const newUser = {
    id: Date.now().toString(),
    username,
    password: hashed,
    role
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
    return res.render('login', { error: 'Galat username ya password.' });
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ----- Dashboard (user's own boxes) -----
app.get('/dashboard', requireLogin, (req, res) => {
  const myBoxes = db.get('boxes').filter({ userId: req.session.user.id }).value();
  res.render('dashboard', { user: req.session.user, boxes: myBoxes });
});

// ----- Create a new box (code/notes) -----
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

// ----- Edit a box -----
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

// ----- Delete a box -----
app.post('/box/:id/delete', requireLogin, (req, res) => {
  const box = db.get('boxes').find({ id: req.params.id }).value();
  if (!box || box.userId !== req.session.user.id) return res.status(403).send('Access denied.');

  db.get('boxes').remove({ id: req.params.id }).write();
  res.redirect('/dashboard');
});

// ----- Admin panel: sab users aur unke boxes -----
app.get('/admin', requireLogin, requireAdmin, (req, res) => {
  const users = db.get('users').value();
  const boxes = db.get('boxes').value();
  res.render('admin', { user: req.session.user, users, boxes });
});

app.listen(PORT, () => {
  console.log(`Box app chal raha hai: http://localhost:${PORT}`);
});
