import { pool } from './connection.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randInt(0, items.length - 1)];
}

function normalizeDepartmentContext(name) {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return 'UNKNOWN';

  if (raw.includes('อายุรกรรม')) return 'INTERNAL';
  if (raw.includes('ศัลยกรรม')) return 'SURGERY';
  if (raw.includes('กุมารเวช')) return 'PEDIATRIC';
  if (raw.includes('สูติ') || raw.includes('นรี')) return 'OBGYN';
  if (raw.includes('semi icu') || raw.includes('semi-icu') || raw.includes('icu') || raw.includes('วิกฤต')) return 'ICU';
  if (raw === 'er' || raw.includes('er ') || raw.includes('ฉุกเฉิน') || raw.includes('อุบัติเหตุ')) return 'ER';

  return `RAW:${raw}`;
}

function isDepartmentCompatible(expContext, ctrlContext) {
  if (!expContext || !ctrlContext) return false;

  if (expContext === ctrlContext && expContext !== 'UNKNOWN') return true;
  if (expContext.startsWith('RAW:') || ctrlContext.startsWith('RAW:')) return expContext === ctrlContext;
  if (expContext === 'UNKNOWN' || ctrlContext === 'UNKNOWN') return false;

  if (expContext === 'SURGERY' && (ctrlContext === 'SURGERY' || ctrlContext === 'PEDIATRIC')) return true;
  if (expContext === 'PEDIATRIC' && (ctrlContext === 'SURGERY' || ctrlContext === 'PEDIATRIC')) return true;

  return false;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function toTimeString(hours, minutes = 0) {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

function buildComponents(totalScore) {
  const components = Array(7).fill(0);
  let remaining = Math.max(0, Math.min(21, Number(totalScore) || 0));

  while (remaining > 0) {
    const idx = randInt(0, 6);
    if (components[idx] < 3) {
      components[idx] += 1;
      remaining -= 1;
    }
  }

  return components;
}

function buildAssessmentRow({ userId, round, score, assessmentDate }) {
  const [c1, c2, c3, c4, c5, c6, c7] = buildComponents(score);
  const referenceStart = new Date(assessmentDate);
  referenceStart.setDate(referenceStart.getDate() - 30);

  const bedtimeHour = randInt(21, 23);
  const wakeHour = randInt(5, 7);

  return [
    userId,
    round,
    toDateString(assessmentDate),
    toDateString(referenceStart),
    toDateString(assessmentDate),
    toTimeString(bedtimeHour, pick([0, 15, 30, 45])),
    randInt(10, 60),
    toTimeString(wakeHour, pick([0, 15, 30, 45])),
    Number((randInt(50, 85) / 10).toFixed(2)),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    null,
    randInt(0, 3),
    null,
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    randInt(0, 3),
    null,
    c1,
    c2,
    c3,
    c4,
    c5,
    c6,
    c7,
    Math.max(0, Math.min(21, Number(score))),
    'คุณภาพการนอนหลับไม่ดี',
  ];
}

const ASSESSMENT_COLUMNS = [
  'user_id',
  'assessment_round',
  'assessment_date',
  'reference_start_date',
  'reference_end_date',
  'bedtime',
  'sleep_latency_minutes',
  'wake_time',
  'sleep_duration_hours',
  'q5_1',
  'q5_2',
  'q5_3',
  'q5_4',
  'q5_5',
  'q5_6',
  'q5_7',
  'q5_8',
  'q5_9',
  'q5_9_detail',
  'q5_10',
  'q5_10_detail',
  'q6',
  'q7',
  'q8',
  'q9',
  'q10',
  'q10_1',
  'q10_2',
  'q10_3',
  'q10_4',
  'q10_5',
  'q10_5_detail',
  'component_1',
  'component_2',
  'component_3',
  'component_4',
  'component_5',
  'component_6',
  'component_7',
  'total_score',
  'interpretation',
];

const ASSESSMENT_INSERT_SQL = `
  INSERT INTO user_assessments (
    ${ASSESSMENT_COLUMNS.join(',\n    ')}
  ) VALUES (${ASSESSMENT_COLUMNS.map(() => '?').join(', ')})
`;

function buildDisplayName(index, gender) {
  const male = ['สมชาย', 'กิตติ', 'วีระ', 'ณัฐพล', 'ธนวัฒน์', 'เอกชัย'];
  const female = ['สุดารัตน์', 'พรทิพย์', 'กมลชนก', 'พิมพ์ชนก', 'วิภา', 'ชลธิชา'];
  const first = gender === 1 ? pick(male) : pick(female);
  return `${first} ตัวอย่าง${String(index + 1).padStart(2, '0')}`;
}

function pickCompatibleDepartment(expDept, departments) {
  const expContext = normalizeDepartmentContext(expDept.name);
  const candidates = departments.filter((dept) =>
    isDepartmentCompatible(expContext, normalizeDepartmentContext(dept.name))
  );
  if (candidates.length > 0) return pick(candidates);
  return expDept;
}

async function seedMatchingDemoUsers() {
  const requested = Number(process.argv[2] || 10);
  const totalUsers = Number.isInteger(requested) && requested > 0 ? requested : 10;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [hospitalRows] = await connection.query(
      'SELECT id, name FROM master_hospitals WHERE is_active = 1 ORDER BY id'
    );
    const [departmentRows] = await connection.query(
      'SELECT id, name FROM master_departments WHERE is_active = 1 ORDER BY id'
    );

    if (!hospitalRows.length || !departmentRows.length) {
      throw new Error('ไม่พบข้อมูล master_hospitals/master_departments กรุณารัน migrations ก่อน');
    }

    const experimentCount = Math.ceil(totalUsers / 2);
    const controlCount = totalUsers - experimentCount;
    const maxPairs = Math.min(experimentCount, controlCount);

    const experimentBlueprints = [];
    const controlBlueprints = [];

    for (let i = 0; i < experimentCount; i += 1) {
      const gender = pick([1, 2]);
      const age = randInt(24, 50);
      const dept = pick(departmentRows);
      const psqiRound1 = randInt(6, 12);
      const psqiRound2 = Math.max(3, psqiRound1 + randInt(-3, 1));

      experimentBlueprints.push({
        group: 2,
        gender,
        age,
        dept,
        psqiRound1,
        psqiRound2,
      });
    }

    for (let i = 0; i < controlCount; i += 1) {
      if (i < maxPairs) {
        const exp = experimentBlueprints[i];
        const dept = pickCompatibleDepartment(exp.dept, departmentRows);
        const psqiRound1 = Math.max(6, exp.psqiRound1 + randInt(-2, 2));
        const psqiRound2 = Math.max(3, psqiRound1 + randInt(-2, 2));

        controlBlueprints.push({
          group: 3,
          gender: exp.gender,
          age: Math.max(20, exp.age + randInt(-4, 4)),
          dept,
          psqiRound1,
          psqiRound2,
        });
      } else {
        const gender = pick([1, 2]);
        const age = randInt(24, 50);
        const dept = pick(departmentRows);
        const psqiRound1 = randInt(6, 12);
        const psqiRound2 = Math.max(3, psqiRound1 + randInt(-3, 1));

        controlBlueprints.push({
          group: 3,
          gender,
          age,
          dept,
          psqiRound1,
          psqiRound2,
        });
      }
    }

    const allPlans = [...experimentBlueprints, ...controlBlueprints];
    const createdUsers = [];

    for (let i = 0; i < allPlans.length; i += 1) {
      const plan = allPlans[i];
      const now = Date.now();
      const suffix = `${now}${String(i).padStart(2, '0')}${randInt(1000, 9999)}`;
      const codePrefix = plan.group === 2 ? 'EXP' : 'CTL';
      const codeId = `DEMO-${codePrefix}-${String(i + 1).padStart(3, '0')}-${suffix.slice(-4)}`;
      const lineUserId = `demo-line-${suffix}`;
      const displayName = buildDisplayName(i, plan.gender);
      const email = `demo.matching.${suffix}@example.test`;

      const [userResult] = await connection.query(
        `
          INSERT INTO users (
            code_id,
            line_user_id,
            display_name,
            email,
            status,
            approval_status
          ) VALUES (?, ?, ?, ?, 'ACTIVE', 'APPROVED')
        `,
        [codeId, lineUserId, displayName, email]
      );

      const userId = Number(userResult.insertId);
      createdUsers.push({ id: userId, codeId, studyGroup: plan.group });

      await connection.query(
        `
          INSERT INTO user_screenings (
            user_id,
            full_name,
            name_prefix,
            first_name,
            last_name,
            age,
            gender,
            marital_status,
            has_children,
            children_count,
            education,
            hospital_id,
            department_id,
            study_group,
            current_position_years,
            current_position_months,
            shift_work_years,
            shift_work_months,
            night_shift_per_month,
            working_hours_per_week,
            weight_kg,
            height_cm,
            has_underlying_disease,
            underlying_disease_type,
            underlying_disease_detail,
            phone,
            line_id,
            inclusion_1,
            inclusion_2,
            inclusion_3,
            inclusion_4,
            inclusion_result,
            exclusion_1,
            exclusion_2,
            exclusion_3,
            exclusion_4,
            exclusion_result,
            screening_result,
            consent_accepted_at,
            consent_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userId,
          displayName,
          null,
          displayName.split(' ')[0] || null,
          null,
          plan.age,
          plan.gender,
          pick([1, 2]),
          0,
          0,
          pick([1, 2, 3, 4]),
          Number(pick(hospitalRows).id),
          Number(plan.dept.id),
          plan.group,
          Number((randInt(1, 12) + randInt(0, 11) / 12).toFixed(2)),
          randInt(0, 11),
          Number((randInt(1, 12) + randInt(0, 11) / 12).toFixed(2)),
          randInt(0, 11),
          randInt(2, 12),
          Number((randInt(36, 60) + randInt(0, 9) / 10).toFixed(2)),
          Number((randInt(48, 78) + randInt(0, 9) / 10).toFixed(2)),
          Number((randInt(150, 175) + randInt(0, 9) / 10).toFixed(2)),
          0,
          null,
          null,
          `08${randInt(10000000, 99999999)}`,
          `line-demo-${suffix}`,
          1,
          1,
          1,
          1,
          1,
          0,
          0,
          0,
          0,
          0,
          1,
          new Date(),
          'demo-v1',
        ]
      );

      const week1Date = new Date();
      week1Date.setDate(week1Date.getDate() - randInt(50, 70));
      const week8Date = new Date(week1Date);
      week8Date.setDate(week8Date.getDate() + 56);

      const round1Values = buildAssessmentRow({
        userId,
        round: 1,
        score: plan.psqiRound1,
        assessmentDate: week1Date,
      });

      const round2Values = buildAssessmentRow({
        userId,
        round: 2,
        score: plan.psqiRound2,
        assessmentDate: week8Date,
      });

      await connection.query(ASSESSMENT_INSERT_SQL, round1Values);
      await connection.query(ASSESSMENT_INSERT_SQL, round2Values);
    }

    await connection.commit();

    const expCreated = createdUsers.filter((item) => item.studyGroup === 2).length;
    const ctrlCreated = createdUsers.filter((item) => item.studyGroup === 3).length;
    console.log(`สร้างข้อมูลตัวอย่างสำเร็จ ${createdUsers.length} คน (ทดลอง ${expCreated}, ควบคุม ${ctrlCreated})`);
  } catch (error) {
    await connection.rollback();
    console.error('Seed matching demo failed:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      sql: error.sql,
    });
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

seedMatchingDemoUsers();