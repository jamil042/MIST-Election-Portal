require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { ValidStudent } = require('./Student');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/university_voting';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const students = [];
  const csvPath = path.join(__dirname, 'students.csv');

  if (!fs.existsSync(csvPath)) {
    console.log('⚠️  students.csv not found. Creating sample data...');
    await seedSampleData();
    await mongoose.disconnect();
    return;
  }

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', row => {
      if (row.studentId && row.name && row.department && row.batch) {
        students.push({
          studentId: row.studentId.toUpperCase().trim(),
          name: row.name.trim(),
          department: row.department.trim(),
          batch: row.batch.trim(),
          isRegistered: false
        });
      }
    })
    .on('end', async () => {
      console.log(`📥 Loaded ${students.length} students from CSV`);

      let inserted = 0;
      for (const s of students) {
        try {
          await ValidStudent.updateOne(
            { studentId: s.studentId },
            { $setOnInsert: s },
            { upsert: true }
          );
          inserted++;
        } catch (e) {
          console.warn(`Skipped ${s.studentId}: ${e.message}`);
        }
      }

      console.log(`✅ Seeded ${inserted} valid students`);
      await mongoose.disconnect();
    });
}

async function seedSampleData() {
  const sampleStudents = [
    { studentId: 'CSE2101001', name: 'Md. Arif Hossain', department: 'CSE', batch: '21' },
    { studentId: 'CSE2101002', name: 'Fatima Khatun', department: 'CSE', batch: '21' },
    { studentId: 'CSE2101003', name: 'Rakib Hassan', department: 'CSE', batch: '21' },
    { studentId: 'CSE2201004', name: 'Sumaiya Islam', department: 'CSE', batch: '22' },
    { studentId: 'CSE2201005', name: 'Tanvir Ahmed', department: 'CSE', batch: '22' },
    { studentId: 'EEE2101001', name: 'Nusrat Jahan', department: 'EEE', batch: '21' },
    { studentId: 'EEE2101002', name: 'Mehedi Hasan', department: 'EEE', batch: '21' },
    { studentId: 'BBA2201001', name: 'Ayesha Siddiqua', department: 'BBA', batch: '22' },
    { studentId: 'BBA2201002', name: 'Imran Khan', department: 'BBA', batch: '22' },
    { studentId: 'CSE2301001', name: 'Zara Akter', department: 'CSE', batch: '23' }
  ];

  for (const s of sampleStudents) {
    await ValidStudent.updateOne(
      { studentId: s.studentId },
      { $setOnInsert: { ...s, isRegistered: false } },
      { upsert: true }
    );
  }

  console.log(`✅ Seeded ${sampleStudents.length} sample students`);
  console.log('📝 Sample student IDs:', sampleStudents.map(s => s.studentId).join(', '));
}

seed().catch(console.error);
