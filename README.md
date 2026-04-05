# University Online Voting System

A full-stack voting system for university club elections. Students register using their university Student ID, which is verified against official records. Admins create ballots with multiple ranked positions (President, VP, Secretary, etc.) and set voting time windows.

---

## Features

- **Student ID validation** — only students in the university database can register
- **Secure authentication** — JWT-based login, bcrypt password hashing
- **Multi-rank ballots** — 6 positions per ballot (President, VP, Secretary, Asst. Secretary, Treasurer, Asst. Treasurer)
- **One vote per position** — enforced at both app and database level (unique index)
- **Timed voting** — admin sets start/end times; portal shows active/upcoming/closed
- **Live results** — admin sees real-time tally; students see results after voting closes
- **Admin panel** — create, publish, manage ballots and view results

---

## Setup

### 1. Prerequisites
- Node.js v18+
- MongoDB (local or MongoDB Atlas)

### 2. Install
```bash
cd university-voting
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env and set:
# MONGODB_URI=mongodb://localhost:27017/university_voting
# JWT_SECRET=some_long_random_string_here
# ADMIN_SECRET=your_admin_password_here
```

### 4. Seed valid student IDs
Edit `seeds/students.csv` with your university's student roster:
```csv
studentId,name,department,batch
CSE2101001,Md. Arif Hossain,CSE,21
EEE2201002,Fatima Khatun,EEE,22
```

Then run:
```bash
npm run seed
```

> **Note**: If you do not have a CSV, the seeder will automatically create 10 sample students for testing.

### 5. Start the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 6. Access the system
| URL | Purpose |
|-----|---------|
| `http://localhost:5000` | Student voting portal |
| `http://localhost:5000/admin.html` | Admin panel |

---

## How to use

### Admin workflow
1. Open `http://localhost:5000/admin.html`
2. Enter your `ADMIN_SECRET` key
3. Click **+ New Ballot**
4. Fill in title (e.g. "Cyber Security Club Elections 2024"), organization, and time window
5. For each rank (6 default ranks pre-filled), add candidates with their name and student ID
6. Click **Create Ballot** → then **Publish**
7. Students can now vote during the time window
8. Click **Results** on any ballot to see live tally

### Student workflow
1. Open `http://localhost:5000`
2. Click **Register** → enter your Student ID + details
   - Registration fails if Student ID is not in university records
3. After login, see active elections on the portal
4. Click **Vote Now** → select one candidate per position → click **Vote for [Position]**
5. After voting closes, click **View Results** to see winners

---

## Student ID format
Student IDs should match exactly what is in `seeds/students.csv`. The system validates:
- ID exists in valid student records
- ID has not already been used to register an account

---

## Project structure
```
university-voting/
├── server/
│   ├── index.js              # Express server
│   ├── routes/
│   │   ├── auth.js           # Register, login
│   │   ├── ballot.js         # Create, list, publish ballots
│   │   ├── vote.js           # Cast votes
│   │   └── results.js        # Tally and return results
│   ├── models/
│   │   ├── Student.js        # ValidStudent + Student models
│   │   ├── Ballot.js         # Ballot with ranks & candidates
│   │   └── Vote.js           # Individual vote records
│   └── middleware/
│       └── auth.js           # JWT + admin key middleware
├── public/
│   ├── index.html            # Student portal (SPA)
│   └── admin.html            # Admin panel
├── seeds/
│   ├── students.csv          # Your university's student roster
│   └── seedStudents.js       # Seeder script
├── .env.example
├── package.json
└── README.md
```

---

## Security notes
- Change `JWT_SECRET` and `ADMIN_SECRET` in `.env` before deployment
- Never commit your `.env` file
- For production, use MongoDB Atlas and deploy to a cloud server (Railway, Render, etc.)
- Add HTTPS in production (use a reverse proxy like Nginx or use cloud hosting)

---

## Extending student ID validation

To integrate with your university's actual student database instead of a CSV, modify `server/routes/auth.js` in the `/register` endpoint. Replace the `ValidStudent.findOne()` check with a call to your university's API or database.
