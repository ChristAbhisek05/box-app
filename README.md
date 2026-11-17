# 📦 Box

Apna khud ka code/notes store karne wala app — login system ke saath (Admin + Users).

## Features
- Register / Login (password safely hashed hota hai)
- Har user apna "Box" bana sakta hai jisme code/notes save hote hain
- **Drive feature**: har user apne photos/documents upload kar sakta hai
- Sirf **ek hi Admin** account ban sakta hai — wahi sabka data (boxes + files) dekh sakta hai Admin Panel me
- Data `db.json` file me store hota hai, files `uploads/` folder me — koi alag database install karne ki zaroorat nahi

## Admin kaise banaye
`server.js` me ye line hai:
```js
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
```
Jo bhi username `admin` rakh ke register karega, wo automatically **admin** ban jayega.
(Deploy karte waqt environment variable `ADMIN_USERNAME` set karke bhi change kar sakte ho.)

---

## 🖥️ Step 1: Apne computer pe test karo (optional, par recommended)

```bash
npm install
npm start
```
Phir browser me kholo: `http://localhost:3000`

---

## 🐙 Step 2: GitHub pe Upload karo

1. GitHub.com pe login karo, upar right side "+" > **New repository** click karo.
2. Repository ka naam do: `box-app` (ya jo chaho).
3. **Create repository** dabao (README add mat karna, humara already hai).
4. Ab apne terminal me is folder ke andar ye commands chalao (GitHub wali screen pe bhi ye commands milenge):

```bash
git init
git add .
git commit -m "Box app - first version"
git branch -M main
git remote add origin https://github.com/<aapka-username>/box-app.git
git push -u origin main
```

Bas! Code ab GitHub pe chala gaya.

---

## 🚀 Step 3: Website ko LIVE karo (hosting)

GitHub sirf code store karta hai, use "chalata" nahi. Isko live/online chalane ke liye free backend hosting chahiye. Sabse aasan option:

### Render.com (Free, recommended)
1. [render.com](https://render.com) pe GitHub account se sign up karo.
2. **New +** > **Web Service** click karo.
3. Apna `box-app` GitHub repo select karo.
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Environment Variables me add karo (optional but recommended):
   - `ADMIN_USERNAME` = tumhara admin wala username
   - `SESSION_SECRET` = koi bhi random long text
6. **Create Web Service** dabao. 2-3 minute me live ho jayega, ek link milega jaise:
   `https://box-app-xyz.onrender.com`

Us link ko apne friend ko bhejo — wo wahi pe register/login karke apna code store kar sakta hai!

> ⚠️ Note: Free Render service thodi der inactive rehne pe "sleep" ho jati hai, pehli request pe 30-50 sec lag sakte hain start hone me. Ye normal hai free plan me.

---

## 📁 Project Structure
```
box-app/
├── server.js          # Saara backend logic (routes)
├── db.js              # Simple file-based database
├── package.json
├── views/             # Saare HTML pages (EJS)
│   ├── login.ejs
│   ├── register.ejs
│   ├── dashboard.ejs
│   ├── box-form.ejs
│   └── admin.ejs
└── public/
    └── style.css
```

## Aage kya improve kar sakte ho
- Password reset / forgot password feature
- Syntax highlighting code ke liye (e.g. highlight.js)
- Boxes ko public/private share karne ka option
- Search/filter apne boxes me
