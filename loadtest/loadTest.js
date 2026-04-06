const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
const targetUsers = Number(process.env.USERS || process.argv[2] || 200);
const concurrency = Number(process.env.CONCURRENCY || 25);
const csvPath = path.join(__dirname, '..', 'students.csv');

function readStudents(limit) {
  return new Promise((resolve, reject) => {
    const students = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', row => {
        if (row.studentId && row.name && row.department && row.batch) {
          students.push({
            studentId: row.studentId.trim(),
            name: row.name.trim(),
            department: row.department.trim(),
            batch: row.batch.trim()
          });
        }
      })
      .on('end', () => resolve(students.slice(0, limit)))
      .on('error', reject);
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

function emailFor(studentId) {
  return `${studentId.toLowerCase()}@loadtest.local`;
}

function passwordFor(studentId) {
  return `LoadTest@${studentId.slice(-4)}!`;
}

async function registerStudent(student) {
  const payload = {
    studentId: student.studentId,
    name: student.name,
    email: emailFor(student.studentId),
    password: passwordFor(student.studentId),
    department: student.department,
    batch: student.batch
  };

  const result = await requestJson(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (result.status === 201) {
    return { ok: true, created: true };
  }

  if (result.status === 400 && result.body && /already registered|already in use/i.test(result.body.message || '')) {
    return { ok: true, created: false, alreadyExists: true };
  }

  return { ok: false, error: result.body?.message || `HTTP ${result.status}` };
}

async function loginStudent(student) {
  const result = await requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      studentId: student.studentId,
      password: passwordFor(student.studentId)
    })
  });

  if (result.status === 200 && result.body?.token) {
    return { ok: true, token: result.body.token };
  }

  return { ok: false, error: result.body?.message || `HTTP ${result.status}` };
}

async function createUsableSession(student) {
  const registration = await registerStudent(student);
  if (!registration.ok) {
    return { ok: false, skipped: true, phase: 'register', error: registration.error };
  }

  const login = await loginStudent(student);
  if (!login.ok) {
    return { ok: false, skipped: true, phase: 'login', error: login.error };
  }

  return {
    ok: true,
    token: login.token,
    registrationCreated: !registration.alreadyExists,
    student,
    skipped: false
  };
}

async function getBallots(token) {
  const result = await requestJson(`${baseUrl}/api/ballots`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (result.status === 200 && Array.isArray(result.body?.ballots)) {
    return { ok: true, ballots: result.body.ballots };
  }

  return { ok: false, error: result.body?.message || `HTTP ${result.status}` };
}

async function voteForBallot(token, ballot) {
  if (!ballot || !Array.isArray(ballot.ranks) || ballot.ranks.length === 0) {
    return { ok: true, skipped: true };
  }

  const selections = ballot.ranks
    .filter(rank => Array.isArray(rank.candidates) && rank.candidates.length > 0)
    .map(rank => ({
      rankTitle: rank.title,
      candidateId: rank.candidates[0]._id
    }));

  if (!selections.length) {
    return { ok: true, skipped: true, votes: 0 };
  }

  const result = await requestJson(`${baseUrl}/api/vote/submit-ballot`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      ballotId: ballot._id,
      selections
    })
  });

  if (result.status === 201) {
    return { ok: true, votes: selections.length };
  }

  if (result.status === 409 && /already submitted|already voted/i.test(result.body?.message || '')) {
    return { ok: true, votes: selections.length };
  }

  return { ok: false, error: result.body?.message || `HTTP ${result.status}`, success: 0 };
}

async function runUser(student, ballot) {
  const startedAt = Date.now();

  const session = await createUsableSession(student);
  if (!session.ok) {
    return { ok: false, skipped: true, phase: session.phase, error: session.error, elapsedMs: Date.now() - startedAt };
  }

  if (!ballot) {
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      votes: 0,
      registrationCreated: session.registrationCreated,
      skipped: false,
      voteSkipped: true
    };
  }

  const vote = await voteForBallot(session.token, ballot);
  if (!vote.ok) {
    return { ok: false, phase: 'vote', error: vote.error, elapsedMs: Date.now() - startedAt };
  }

  return {
    ok: true,
    elapsedMs: Date.now() - startedAt,
    votes: vote.votes || 0,
    registrationCreated: session.registrationCreated
  };
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`students.csv not found at ${csvPath}`);
  }

  const students = await readStudents(targetUsers);
  if (students.length === 0) {
    throw new Error('No students were loaded from students.csv');
  }

  console.log(`Load test target: ${students.length} students`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Concurrency: ${concurrency}`);

  const health = await requestJson(`${baseUrl}/api/health`, { method: 'GET' });
  console.log(`Health check: ${health.status === 200 ? 'ok' : 'failed'} (${health.status})`);

  let ballot = null;
  const firstStudent = students[0];
  let firstSession = await createUsableSession(firstStudent);
  if (!firstSession.ok) {
    const fallbackStudent = students.slice(1).find(Boolean);
    if (fallbackStudent) {
      firstSession = await createUsableSession(fallbackStudent);
    }
  }

  if (!firstSession.ok) {
    console.log(`Could not prepare a session for ballot lookup: ${firstSession.error}`);
  }

  if (firstSession.ok && firstSession.token) {
    const ballots = await getBallots(firstSession.token);
    if (ballots.ok) {
      ballot = ballots.ballots.find(item => item.status === 'active') || null;
      if (ballot) {
        console.log(`Using ballot: ${ballot.title}`);
        console.log(`Ranks in ballot: ${ballot.ranks?.length || 0}`);
      } else {
        console.log('No active ballot found. The test will cover register/login only.');
      }
    } else {
      console.log(`Could not read ballots yet: ${ballots.error}`);
    }
  }

  const results = [];
  for (let index = 0; index < students.length; index += concurrency) {
    const batch = students.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map(async student => {
      const result = await runUser(student, ballot);
      return { studentId: student.studentId, ...result };
    }));

    results.push(...batchResults);

    const done = Math.min(index + batch.length, students.length);
    console.log(`Completed ${done}/${students.length}`);
  }

  const total = results.length;
  const passed = results.filter(result => result.ok).length;
  const skipped = results.filter(result => result.skipped).length;
  const failed = total - passed - skipped;
  const avgMs = passed > 0
    ? Math.round(results.filter(result => result.ok).reduce((sum, result) => sum + result.elapsedMs, 0) / passed)
    : 0;
  const p95Ms = (() => {
    const times = results.filter(result => result.ok).map(result => result.elapsedMs).sort((a, b) => a - b);
    if (times.length === 0) return 0;
    return times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)];
  })();

  console.log('--- Load Test Summary ---');
  console.log(`Total users: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Average duration (ms): ${avgMs}`);
  console.log(`p95 duration (ms): ${p95Ms}`);

  if (failed > 0) {
    const sampleErrors = results.filter(result => !result.ok).slice(0, 10);
    console.log('Sample failures:');
    sampleErrors.forEach(item => {
      console.log(`${item.studentId} -> ${item.phase}: ${item.error}`);
    });
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Load test failed:', err.message);
  process.exit(1);
});
