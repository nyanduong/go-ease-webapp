import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelConfirmations,
  confirmAction,
  getConfirmation,
  settleConfirmation,
  subscribeConfirmations,
} from '../src/platform/confirmation.ts';

test('confirmation requests queue, repeated requests share a prompt, and each settles once', async () => {
  cancelConfirmations();
  const first = confirmAction({ title: 'Xóa chuyến?', message: 'Chuyến A', danger: true });
  const repeated = confirmAction({ title: 'Xóa chuyến?', message: 'Chuyến A', danger: true });
  const second = confirmAction({ title: 'Rời trang?', message: 'Thay đổi chưa lưu' });
  assert.equal(first, repeated);
  const firstId = getConfirmation().id;
  assert.equal(getConfirmation().options.message, 'Chuyến A');
  settleConfirmation(firstId, false);
  assert.equal(await first, false);
  assert.equal(await repeated, false);
  assert.equal(getConfirmation().options.message, 'Thay đổi chưa lưu');
  // A late click from the old dialog must not approve the new dialog.
  settleConfirmation(firstId, true);
  assert.equal(getConfirmation().options.message, 'Thay đổi chưa lưu');
  settleConfirmation(getConfirmation().id, true);
  assert.equal(await second, true);
  assert.equal(getConfirmation(), null);
});

test('account/route invalidation cancels all requests without leaving unresolved actions', async () => {
  const first = confirmAction({ title: 'Xóa chuyến?', message: 'Tài khoản A' });
  const queued = confirmAction({ title: 'Nhập chuyến?', message: 'Tài khoản A' });
  const staleId = getConfirmation().id;
  cancelConfirmations();
  assert.deepEqual(await Promise.all([first, queued]), [false, false]);
  const newOwner = confirmAction({ title: 'Xóa chuyến?', message: 'Tài khoản B' });
  settleConfirmation(staleId, true);
  assert.equal(getConfirmation().options.message, 'Tài khoản B');
  settleConfirmation(getConfirmation().id, false);
  assert.equal(await newOwner, false);
});

test('unsubscribing a confirmation host removes notifications and cancellation stays reusable', async () => {
  let notifications = 0;
  const unsubscribe = subscribeConfirmations(() => notifications++);
  const request = confirmAction({ title: 'Lưu thay đổi?', message: 'Chuyến A' });
  assert.equal(notifications, 1);
  unsubscribe();
  cancelConfirmations();
  assert.equal(await request, false);
  assert.equal(notifications, 1);
  assert.equal(getConfirmation(), null);
});
