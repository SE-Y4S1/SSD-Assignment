/**
 * Brings rows written before V-A16 into line with the schema.
 *
 * contact.email had no lowercase setting, so the unique index treated
 * Doc@x.com and doc@x.com as two different mailboxes. Adding lowercase to the
 * schema only affects writes from now on; rows already stored keep whatever
 * case they were saved with, and the duplicate pair stays logged in.
 *
 * Run once against each environment, before anyone relies on the new index:
 *   MONGO_URI=... node scripts/normalise-doctor-emails.js
 *   MONGO_URI=... node scripts/normalise-doctor-emails.js --apply
 *
 * Without --apply it only reports. Collisions are never merged automatically:
 * two accounts on one mailbox is a decision for whoever owns the data.
 */

const mongoose = require('mongoose');
const Doctor = require('../src/models/Doctor');

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const doctors = await Doctor.find({}, 'contact.email').lean();
  const byNormalised = new Map();
  const needChange = [];

  for (const doc of doctors) {
    const current = doc.contact && doc.contact.email;
    if (typeof current !== 'string') continue;
    const normalised = current.trim().toLowerCase();
    if (!byNormalised.has(normalised)) byNormalised.set(normalised, []);
    byNormalised.get(normalised).push({ id: doc._id, current });
    if (normalised !== current) needChange.push({ id: doc._id, current, normalised });
  }

  const collisions = [...byNormalised.entries()].filter(([, rows]) => rows.length > 1);

  console.log(`${doctors.length} doctor rows read.`);
  console.log(`${needChange.length} need their email normalised.`);
  console.log(`${collisions.length} mailboxes hold more than one account.`);

  for (const [normalised, rows] of collisions) {
    console.log(`  ${normalised}: ${rows.map((r) => `${r.id} (${r.current})`).join(', ')}`);
  }

  if (collisions.length) {
    console.log('\nResolve the accounts above by hand first. Normalising them now');
    console.log('would fail on the unique index, or hide one account behind another.');
    await mongoose.disconnect();
    process.exit(collisions.length ? 2 : 0);
  }

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply to make these changes.');
    await mongoose.disconnect();
    return;
  }

  for (const row of needChange) {
    await Doctor.updateOne({ _id: row.id }, { $set: { 'contact.email': row.normalised } });
    console.log(`  ${row.id}: ${row.current} -> ${row.normalised}`);
  }
  console.log(`\n${needChange.length} rows updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
