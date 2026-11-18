// server.js
// "Box" - every user gets their own code notes + a mini Drive for files.
// Only ONE admin exists, and the admin can see everyone's data.

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// The one and only username that becomes admin. Change via env var if needed.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

// ---------- Email (OTP) setup ----------
// Set EMAIL_USER and EMAIL_PASS (a Gmail App Password) as environment variables
// to actually send emails. Without them, the OTP is printed to the server
// console instead, which is handy for local testing.
const EMAIL_USER = process.env.EMAIL_USER || null;
const EMAIL_PASS = process.env.EMAIL_PASS || null;

let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });
}

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
}

async function sendOtpEmail(toEmail, otp) {
  if (!transporter) {
    // Dev fallback: no email configured, just log it.
    console.log(`[DEV MODE - no email configured] OTP for ${toEmail}: ${otp}`);
    return;
  }
  await transporter.sendMail({
    from: `"Box" <${EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your Box verification code',
    text: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
    html: `<p>Your verification code is:</p><h2 style="letter-spacing:4px;">${otp}</h2><p>This code expires in 10 minutes.</p>`
  });
}

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

// ----- Register: step 1 - collect details, send OTP -----
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.render('register', { error: 'Username, email and password are all required.' });
  }

  const existingUser = db.get('users').find({ username }).value();
  if (existingUser) {
    return res.render('register', { error: 'This username is already taken.' });
  }

  const wantsAdmin = username === ADMIN_USERNAME;
  if (wantsAdmin) {
    const adminAlreadyExists = db.get('users').find({ role: 'admin' }).value();
    if (adminAlreadyExists) {
      return res.render('register', { error: 'An admin account already exists. Choose a different username.' });
    }
  }

  // Remove any older pending request for the same username/email
  db.get('pending').remove({ username }).write();

  const otp = generateOtp();
  const hashed = bcrypt.hashSync(password, 10);
  const pendingId = Date.now().toString();

  db.get('pending').push({
    id: pendingId,
    username,
    email,
    password: hashed,
    role: wantsAdmin ? 'admin' : 'user',
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  }).write();

  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    console.error('Failed to send OTP email:', err.message);
    return res.render('register', { error: 'Could not send the verification email. Please check the email address and try again.' });
  }

  req.session.pendingId = pendingId;
  res.redirect('/verify-otp');
});

// ----- Register: step 2 - verify the OTP -----
app.get('/verify-otp', (req, res) => {
  if (!req.session.pendingId) return res.redirect('/register');
  const pending = db.get('pending').find({ id: req.session.pendingId }).value();
  if (!pending) return res.redirect('/register');
  res.render('verify-otp', { error: null, email: pending.email });
});

app.post('/verify-otp', (req, res) => {
  const pending = db.get('pending').find({ id: req.session.pendingId }).value();
  if (!pending) return res.redirect('/register');

  if (Date.now() > pending.expiresAt) {
    db.get('pending').remove({ id: pending.id }).write();
    req.session.pendingId = null;
    return res.render('register', { error: 'Your code expired. Please register again.' });
  }

  if (req.body.otp !== pending.otp) {
    return res.render('verify-otp', { error: 'Incorrect code. Please try again.', email: pending.email });
  }

  const newUser = {
    id: Date.now().toString(),
    username: pending.username,
    email: pending.email,
    password: pending.password,
    role: pending.role
  };
  db.get('users').push(newUser).write();
  db.get('pending').remove({ id: pending.id }).write();
  req.session.pendingId = null;

  res.redirect('/login');
});

// ----- Register: resend OTP -----
app.post('/verify-otp/resend', async (req, res) => {
  const pending = db.get('pending').find({ id: req.session.pendingId }).value();
  if (!pending) return res.redirect('/register');

  const otp = generateOtp();
  db.get('pending').find({ id: pending.id }).assign({
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000
  }).write();

  try {
    await sendOtpEmail(pending.email, otp);
  } catch (err) {
    console.error('Failed to resend OTP email:', err.message);
  }

  res.render('verify-otp', { error: 'A new code has been sent.', email: pending.email });
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
  req.session.destroy(() => res.redirect('/login'));
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

// ----- Admin: view one specific user's full data -----
app.get('/admin/user/:id', requireLogin, requireAdmin, (req, res) => {
  const targetUser = db.get('users').find({ id: req.params.id }).value();
  if (!targetUser) return res.status(404).send('User not found.');

  const userBoxes = db.get('boxes').filter({ userId: targetUser.id }).value();
  const userFiles = db.get('files').filter({ userId: targetUser.id }).value();

  res.render('user-detail', {
    user: req.session.user,
    targetUser,
    boxes: userBoxes,
    files: userFiles,
    humanSize
  });
});

// ----- Admin: remove a user completely (their boxes + files too) -----
app.post('/admin/user/:id/delete', requireLogin, requireAdmin, (req, res) => {
  const targetUser = db.get('users').find({ id: req.params.id }).value();
  if (!targetUser) return res.status(404).send('User not found.');

  if (targetUser.id === req.session.user.id) {
    return res.status(400).send('You cannot remove your own admin account.');
  }

  // Delete the user's uploaded files from disk too
  const userFiles = db.get('files').filter({ userId: targetUser.id }).value();
  userFiles.forEach(f => {
    fs.unlink(path.join(UPLOAD_DIR, f.storedName), () => {});
  });

  db.get('files').remove({ userId: targetUser.id }).write();
  db.get('boxes').remove({ userId: targetUser.id }).write();
  db.get('users').remove({ id: targetUser.id }).write();

  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`Box app running at: http://localhost:${PORT}`);
});
