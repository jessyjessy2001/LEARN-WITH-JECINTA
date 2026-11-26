/**
 * Development-only seed script (`npm run seed:demo`) for manual exploratory testing.
 * NEVER called automatically by initDatabase() or production startup.
 */
import 'dotenv/config';
import { initDatabase, newId } from './db.ts';
import { hashPassword } from './auth.ts';

const db = initDatabase();

const teacher = db.prepare(`SELECT id FROM teachers WHERE is_primary = 1 LIMIT 1`).get() as
  | { id: string }
  | undefined;
const course = db.prepare(`SELECT id, title, subject FROM courses LIMIT 1`).get() as
  | { id: string; title: string; subject: string }
  | undefined;

if (!teacher || !course) {
  console.error('Database base catalog missing.');
  process.exit(1);
}

const existingParent = db
  .prepare(`SELECT id FROM profiles WHERE email = 'demo.parent@example.com'`)
  .get();

if (existingParent) {
  console.log('Dev demo records already exist.');
  process.exit(0);
}

const parentProfileId = newId();
const parentId = newId();
const stu1ProfileId = newId();
const stu1Id = newId();
const stu2Id = newId();

db.exec('BEGIN IMMEDIATE');
try {
  db.prepare(
    `INSERT INTO profiles (id, email, password_hash, full_name, role, phone, country, timezone)
     VALUES (?, 'demo.parent@example.com', ?, 'Grace Wanjiku (Demo Parent)', 'parent', '+254711000001', 'Kenya', 'Africa/Nairobi')`
  ).run(parentProfileId, hashPassword('ParentDemo123!'));

  db.prepare(`INSERT INTO parents (id, profile_id, preferred_currency) VALUES (?, ?, 'KES')`).run(
    parentId,
    parentProfileId
  );

  db.prepare(
    `INSERT INTO profiles (id, email, password_hash, full_name, role, country, timezone)
     VALUES (?, 'demo.student@example.com', ?, 'Amani Wanjiku (Demo Student)', 'student', 'Kenya', 'Africa/Nairobi')`
  ).run(stu1ProfileId, hashPassword('StudentDemo123!'));

  db.prepare(
    `INSERT INTO students (id, profile_id, teacher_id, full_name, age, grade_level, country, timezone, learning_goals)
     VALUES (?, ?, ?, 'Amani Wanjiku', 11, 'Grade 6', 'Kenya', 'Africa/Nairobi', 'Build confidence in fractions and Python basics')`
  ).run(stu1Id, stu1ProfileId, teacher.id);

  db.prepare(
    `INSERT INTO students (id, teacher_id, full_name, age, grade_level, country, timezone, learning_goals)
     VALUES (?, ?, 'Baraka Wanjiku', 8, 'Grade 3', 'Kenya', 'Africa/Nairobi', 'Early mental math and Scratch logic')`
  ).run(stu2Id, teacher.id);

  db.prepare(`INSERT INTO parent_students (id, parent_id, student_id) VALUES (?, ?, ?)`).run(
    newId(),
    parentId,
    stu1Id
  );
  db.prepare(`INSERT INTO parent_students (id, parent_id, student_id) VALUES (?, ?, ?)`).run(
    newId(),
    parentId,
    stu2Id
  );

  db.prepare(
    `INSERT INTO recording_consents (id, parent_id, student_id, consent_given) VALUES (?, ?, ?, 1)`
  ).run(newId(), parentId, stu1Id);

  db.prepare(
    `INSERT INTO enrolments (id, student_id, course_id, teacher_id, status) VALUES (?, ?, ?, ?, 'active')`
  ).run(newId(), stu1Id, course.id, teacher.id);

  const upcomingStart = new Date(Date.now() + 2 * 86400000).toISOString();
  const upcomingEnd = new Date(Date.now() + 2 * 86400000 + 60 * 60000).toISOString();
  const clsId = newId();

  db.prepare(
    `INSERT INTO classes (id, course_id, teacher_id, title, subject, topic, student_instructions, start_time_utc, end_time_utc, duration_minutes, status)
     VALUES (?, ?, ?, ?, ?, 'Equivalent Fractions & Word Problems', 'Bring your squared notebook and ruler.', ?, ?, 60, 'scheduled')`
  ).run(clsId, course.id, teacher.id, `${course.subject}: Amani Wanjiku`, course.subject, upcomingStart, upcomingEnd);

  db.prepare(`INSERT INTO class_participants (id, class_id, student_id) VALUES (?, ?, ?)`).run(
    newId(),
    clsId,
    stu1Id
  );

  db.exec('COMMIT');
  console.log('Dev demo accounts created:');
  console.log('  Parent:  demo.parent@example.com / ParentDemo123!');
  console.log('  Student: demo.student@example.com / StudentDemo123!');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}
