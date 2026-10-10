import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function render(authUser, authMessage = '', authReady = true, authBusy = false) {
  const context = vm.createContext({authUser, authMessage, authReady, authBusy, authStatus: {}, authLogin: {}, authLogout: {}});
  vm.runInContext(html.slice(html.indexOf('function renderAuth()'), html.indexOf('function authErrorMessage(')), context);
  vm.runInContext('renderAuth()', context); return context;
}
test('signed-in UI shows only logout in its normal state', () => {
  const c = render({uid:'fictional'});
  assert.equal(c.authStatus.hidden, true); assert.equal(c.authLogout.hidden, false); assert.equal(c.authLogin.hidden, true);
  assert.ok(!html.includes('auth-uid')); assert.ok(!html.includes('hideAuthUid')); assert.ok(!html.includes('ログイン済み'));
});
test('signed-out login remains available', () => {
  const c = render(null);
  assert.equal(c.authLogin.hidden, false); assert.equal(c.authLogin.disabled, false); assert.equal(c.authLogout.hidden, true);
});
test('errors and pending authentication remain visible', () => {
  for (const message of ['保存できないためログアウトを中止しました','ログアウト中…']) {
    const c = render({uid:'fictional'},message,true,true);
    assert.equal(c.authStatus.hidden,false); assert.equal(c.authStatus.textContent,message); assert.equal(c.authLogout.disabled,true);
  }
  assert.equal(render(null,'',false).authStatus.textContent,'認証確認中…');
});
test('status labels use plain text while preserving state distinctions', () => {
  const body = html.slice(html.indexOf('<body>'));
  assert.ok(!body.includes('☁')); assert.ok(!body.includes('✓'));
  assert.ok(body.includes('保存済み')); assert.ok(body.includes('保存中…')); assert.ok(body.includes('未保存の変更があります')); assert.ok(body.includes('保存失敗'));
});
