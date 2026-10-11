import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTripTotals, calculateTripWarnings, canonicalCreateTrip, canonicalUpdateTrip, isCreateTripRequest,
  isTripCursor, isTripDate, isTripDetail, isTripUuid, isUpdateTripRequest, MAX_AMOUNT_VND, SAMPLE_DESTINATION,
  TRIP_TIME_ZONE, tripDateAt, type TripDetail, type UpdateTripActivity } from '@goease/contracts';

const id = 'aaaaaaaa-0000-4000-8000-000000000001';
const other = 'bbbbbbbb-0000-4000-8000-000000000002';
const now = '2026-10-11T11:00:00.000Z';
const create = { title: ' Chuyến mẫu ', destinationCode: SAMPLE_DESTINATION, startDate: '2028-02-28', durationDays: 3, groupSize: 2, budgetVnd: null };
function activity(patch: Partial<UpdateTripActivity> = {}): UpdateTripActivity {
  return { id: null, placeId: null, title: 'Đi dạo', notes: null, startMinute: null, endMinute: null, estimatedCostVnd: null, ...patch };
}
function update() { return { expectedVersion: 1, title: 'Chuyến mẫu', groupSize: 1, budgetVnd: null, days: [{ dayNumber: 1, activities: [activity()] }] }; }
function detail(): TripDetail {
  const days = [{ id: other, dayNumber: 1, date: '2028-02-28', activities: [{ id, position: 0, title: 'Đi dạo',
    notes: null, startMinute: null, endMinute: null, estimatedCostVnd: null, place: null }] }];
  return { ...create, id, title: 'Chuyến mẫu', durationDays: 1, isSample: true, version: 1, timeZone: TRIP_TIME_ZONE,
    createdAt: now, updatedAt: now, days, totals: calculateTripTotals(days), warnings: [] };
}
test('trip calendar is real, leap-aware and bounded through the final day', () => {
  assert.equal(isTripDate('2028-02-29'), true); assert.equal(isTripDate('2026-02-29'), false);
  assert.equal(isTripDate('2000-02-29'), true); assert.equal(isTripDate('1999-12-31'), false);
  assert.equal(tripDateAt('2028-02-28', 3), '2028-03-01');
  assert.equal(isCreateTripRequest({ ...create, startDate: '2099-12-27', durationDays: 5 }), true);
  assert.equal(isCreateTripRequest({ ...create, startDate: '2099-12-28', durationDays: 5 }), false);
  for (const startDate of ['2026-04-31', '2026-01-01\n', '2026-1-01']) assert.equal(isCreateTripRequest({ ...create, startDate }), false);
});
test('trip DTO denies owner/role, unsafe amounts, invalid group/day/time and sparse collections', () => {
  for (const patch of [{ ownerId: id }, { role: 'ADMIN' }, { groupSize: 0 }, { groupSize: 51 }, { durationDays: 6 },
    { budgetVnd: '10' }, { budgetVnd: -1 }, { budgetVnd: MAX_AMOUNT_VND + 1 }, { budgetVnd: 0.5 }]) assert.equal(isCreateTripRequest({ ...create, ...patch }), false);
  assert.equal(isUpdateTripRequest({ ...update(), days: new Array(1) }), false);
  assert.equal(isUpdateTripRequest({ ...update(), days: [{ dayNumber: 1, activities: new Array(1) }] }), false);
  for (const patch of [{ startMinute: 1 }, { startMinute: 10, endMinute: 10 }, { startMinute: -1, endMinute: 20 }, { startMinute: 0, endMinute: 1441 }]) {
    assert.equal(isUpdateTripRequest({ ...update(), days: [{ dayNumber: 1, activities: [activity(patch)] }] }), false);
  }
});
test('UUIDs reject terminal controls; canonical forms retain order and null versus zero', () => {
  for (const suffix of ['\n', '\r', '\r\n']) {
    assert.equal(isTripUuid(id + suffix), false); assert.equal(isTripCursor({ updatedAt: now, id: id + suffix }), false);
    for (const patch of [{ id: id + suffix }, { placeId: id + suffix }]) assert.equal(isUpdateTripRequest({ ...update(), days: [{ dayNumber: 1, activities: [activity(patch)] }] }), false);
    assert.equal(isTripDetail({ ...detail(), id: id + suffix }), false);
  }
  const dto = { ...update(), days: [{ dayNumber: 1, activities: [activity({ id: id.toUpperCase(), estimatedCostVnd: 0 })] }] };
  assert.equal(canonicalUpdateTrip(dto).days[0]!.activities[0]!.id, id);
  assert.equal(canonicalUpdateTrip(dto).days[0]!.activities[0]!.estimatedCostVnd, 0);
  assert.equal(canonicalCreateTrip(create).title, 'Chuyến mẫu');
  assert.equal(isUpdateTripRequest({ ...dto, days: [{ dayNumber: 1, activities: [activity({ id }), activity({ id: id.toUpperCase() })] }] }), false);
});
test('Unicode limits count code points, reject NUL/surrogates and preserve emoji pairs', () => {
  assert.equal(isCreateTripRequest({ ...create, title: '🧳'.repeat(160) }), true);
  assert.equal(isCreateTripRequest({ ...create, title: '🧳'.repeat(161) }), false);
  for (const title of ['\u0000', '\ud800', '\udc00', ' ']) assert.equal(isCreateTripRequest({ ...create, title }), false);
  for (const length of [1000, 1001]) assert.equal(isUpdateTripRequest({ ...update(), days: [{ dayNumber: 1, activities: [activity({ notes: '🧳'.repeat(length) })] }] }), length === 1000);
});

test('multiline notes preserve LF/CR/TAB in requests and responses without accepting other controls', () => {
  for (const value of ['', '\n\r\tGhi chú\nDòng hai 🧳']) {
    const request = { ...update(), days: [{ dayNumber: 1, activities: [activity({ notes: value })] }] };
    assert.equal(isUpdateTripRequest(request), true);
    assert.equal(canonicalUpdateTrip(request).days[0]!.activities[0]!.notes, value);
    const response = detail(); response.days[0]!.activities[0]!.notes = value;
    assert.equal(isTripDetail(response), true);
  }
  for (const value of ['\u0000', '\u0001', '\u000b', '\u000c', '\u007f', '\u0085', '\ud800']) {
    assert.equal(isUpdateTripRequest({ ...update(), days: [{ dayNumber: 1, activities: [activity({ notes: value })] }] }), false);
    const response = detail(); response.days[0]!.activities[0]!.notes = value;
    assert.equal(isTripDetail(response), false);
  }
  assert.equal(isCreateTripRequest({ ...create, title: 'Tên\nchuyến' }), false);
});
test('budget is a group total; unknown, zero, empty and maximum aggregate remain distinct', () => {
  assert.deepEqual(calculateTripTotals([{ activities: [] }]), { knownSubtotalVnd: 0, unknownCostCount: 0, estimatedTotalVnd: 0 });
  assert.deepEqual(calculateTripTotals([{ activities: [activity({ estimatedCostVnd: 0 }), activity()] }]), { knownSubtotalVnd: 0, unknownCostCount: 1, estimatedTotalVnd: null });
  const days = Array.from({ length: 5 }, () => ({ activities: Array.from({ length: 50 }, () => activity({ estimatedCostVnd: MAX_AMOUNT_VND })) }));
  assert.equal(calculateTripTotals(days).estimatedTotalVnd, 250_000_000_000_000);
});
test('overlaps are warnings, touching intervals are allowed and response checks ignore object key order', () => {
  const d = detail(), first = d.days[0]!.activities[0]!;
  d.days[0]!.activities = [{ ...first, startMinute: 0, endMinute: 60, estimatedCostVnd: 10 }, { ...first, id: other, position: 1, startMinute: 60, endMinute: 120 }];
  d.totals = calculateTripTotals(d.days); assert.deepEqual(calculateTripWarnings(d.days, null), []);
  d.days[0]!.activities[1]!.startMinute = 59;
  d.warnings = [{ dayNumber: 1, code: 'ACTIVITY_OVERLAP' }]; assert.equal(isTripDetail(d), true);
  d.warnings = [{ code: 'ACTIVITY_OVERLAP', dayNumber: 1, extra: true } as never]; assert.equal(isTripDetail(d), false);
});
test('response provenance rejects invalid and credential-bearing URLs and computed totals spoofing', () => {
  assert.equal(isTripDetail(detail()), true);
  for (const sourceUrl of ['https://', 'https://user:pass@example.test/source', 'http://example.test/source']) {
    const d = detail(); d.days[0]!.activities[0]!.place = { id, name: 'Mẫu', latitude: 21, longitude: 105, sourceUrl, attribution: 'TEST ONLY', active: true, isSample: true };
    assert.equal(isTripDetail(d), false);
  }
  const d = detail(); d.totals.estimatedTotalVnd = 0; assert.equal(isTripDetail(d), false);
});
