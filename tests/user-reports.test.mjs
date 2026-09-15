import test from 'node:test';
import assert from 'node:assert/strict';
import { reportRange, buildUserReports, combineUserReports, filterUserReports, reportCsv } from '../lib/user-reports.ts';
import { inferReportCutoff, parseReportGrid } from '../lib/report-import.ts';

test('IST periods and inclusive custom end date', () => {
  const now = Date.parse('2026-09-14T10:00:00Z');
  assert.equal(new Date(reportRange(new URLSearchParams('range=today'), now).from).toISOString(), '2026-09-13T18:30:00.000Z');
  const custom = reportRange(new URLSearchParams('range=custom&from=2026-09-13&to=2026-09-14'));
  assert.equal(new Date(custom.to).toISOString(), '2026-09-14T18:30:00.000Z');
  assert.throws(() => reportRange(new URLSearchParams('range=custom&from=2026-02-30&to=2026-03-01')));
  assert.throws(() => reportRange(new URLSearchParams('range=custom&from=2026-09-15&to=2026-09-14')));
});

test('summary imports skip title rows, preserve IDs, flag duplicate IDs and invalid values', () => {
  const header = ['User ID','Registration Date','First Deposit Date','First Deposit Amount','Total Deposit','Total Withdrawal','Total Deposit Count (TDC)','Total Withdrawal Count (TWC)'];
  const row = ['00123','June 29, 2026','29-Jun-26','100','1000','200','4','1'];
  const result = parseReportGrid([['USER MASTER REPORT'],[],header,row,row,['bad','30-Feb-26','','0','0','0','0','0']]);
  assert.equal(result.users.length, 1);
  assert.equal(result.users[0].userId, '00123');
  assert.equal(result.users[0].registeredAt, '2026-06-28T18:30:00.000Z');
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.errors.length, 1);
});
test('baseline lifetime totals exclude overlaps and repeated imports, dated totals retain real history', () => {
  const cutoff = '2026-09-13T18:30:00Z';
  const now = Date.parse('2026-09-15T00:00Z');
  const baseline = { cutoff, users: [{ userId:'123', name:null, mobile:null, registeredAt:null, firstDepositDate:'2026-06-28T18:30:00Z', firstDepositAmount:100, deposits:1000, withdrawals:200, depositCount:4, withdrawalCount:1, lastDepositDate:null, lastWithdrawalDate:null, totalBonus:30, category:'Silver' }] };
  const txn = (amount, created_at) => ({ user_id:'123', user_name:null, mobile_number:null, type:'deposit', amount, payment_status:'Approved', created_at });
  const transactions = [txn(500,'2026-09-01T00:00Z'),txn(100,cutoff),txn(200,'2026-09-14T12:00Z')];
  const range = { from:Date.parse('2026-09-14T00:00Z'),to:now,label:'Test' };
  const [dated] = combineUserReports([],transactions,range,baseline,false,now);
  assert.equal(dated.deposits,200);
  assert.equal(dated.lifetimeDeposits,1200);
  assert.equal(dated.firstDeposit.amount,100);
  assert.equal(dated.lifetimeDepositCount,5);
  const [lifetime] = combineUserReports([],transactions,range,baseline,true,now);
  assert.equal(lifetime.deposits,1200);
  assert.equal(lifetime.netDeposits,1000);
  assert.deepEqual(combineUserReports([],transactions,range,baseline,true,now),combineUserReports([],transactions,range,baseline,true,now));
});
test('identity-only imported users retain their webhook history before the cutoff', () => {
  const header = ['User ID','Registration Date','First Deposit Date','First Deposit Amount','Total Deposit','Total Withdrawal','Total Deposit Count (TDC)','Total Withdrawal Count (TWC)'];
  const parsed = parseReportGrid([header,['only-id','','','','','','','']]);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.users[0].hasTotals,false);
  const now = Date.parse('2026-09-15T00:00Z');
  const rows = combineUserReports([], [{user_id:'only-id',type:'deposit',amount:250,payment_status:'Approved',created_at:'2026-09-01T00:00Z'}], {from:0,to:now,label:'Lifetime'}, {cutoff:'2026-09-14T00:00Z',users:parsed.users}, true, now);
  assert.equal(rows[0].lifetimeDeposits,250);
});
test('CSV milestones sync without a cutoff and do not inflate dated or lifetime payment totals', () => {
  const now = Date.parse('2026-09-15T00:00Z');
  const history = [{userId:'csv-user',name:null,mobile:null,registeredAt:null,firstDepositDate:'2026-06-28T18:30:00Z',firstDepositAmount:100,lastDepositDate:null,lastWithdrawalDate:null,deposits:10000,withdrawals:5000,depositCount:20,withdrawalCount:5,totalBonus:100,category:null}];
  const transactions = [{user_id:'csv-user',type:'deposit',amount:250,payment_status:'Approved',created_at:'2026-09-14T12:00Z'}];
  const [row] = combineUserReports([],transactions,{from:Date.parse('2026-09-14T00:00Z'),to:now,label:'Today'},null,false,now,history);
  assert.equal(row.firstDeposit.date,history[0].firstDepositDate);
  assert.equal(row.firstDeposit.amount,100);
  assert.equal(row.deposits,250);
  assert.equal(row.lifetimeDeposits,250);
});
test('infers the CSV cutoff as the end of the latest India activity date', () => {
  const users = [{firstDepositDate:'2026-09-01T18:30:00Z',lastDepositDate:'2026-09-09T18:30:00Z',lastWithdrawalDate:null}];
  assert.equal(inferReportCutoff(users),'2026-09-10T18:29:59.999Z');
});
test('combines source, payment, search, and first-deposit filters', () => {
  const range={from:Date.parse('2026-09-14T00:00Z'),to:Date.parse('2026-09-15T00:00Z'),label:'Today'};
  const base={name:null,mobile:null,registeredAt:null,firstWithdrawal:null,withdrawals:0,withdrawalCount:0,unresolvedCount:0,netDeposits:100,bettingPnl:null};
  const rows=[{...base,userId:'CSV-PAID',inCsv:true,firstDeposit:{date:'2026-09-14T12:00Z',amount:100},deposits:100,depositCount:1},{...base,userId:'CSV-OLD',inCsv:true,firstDeposit:{date:'2026-08-01T12:00Z',amount:100},deposits:0,depositCount:0},{...base,userId:'API-PAID',inCsv:false,firstDeposit:{date:'2026-09-14T13:00Z',amount:100},deposits:100,depositCount:1}];
  assert.deepEqual(filterUserReports(rows,{search:'csv',userScope:'csv',paymentFilter:'paid',firstDepositFilter:'period',range}).map(r=>r.userId),['CSV-PAID']);
  assert.deepEqual(filterUserReports(rows,{search:'',userScope:'csv',paymentFilter:'unpaid',firstDepositFilter:'recorded',range}).map(r=>r.userId),['CSV-OLD']);
});
test('lifetime milestones survive period filtering, rejected and pending payments excluded', () => {
  const range = { from: Date.parse('2026-09-14T00:00Z'), to: Date.parse('2026-09-15T00:00Z'), label: 'Test' };
  const txn = (type, amount, payment_status, created_at) => ({ user_id: '123', type, amount, payment_status, created_at, user_name: null, mobile_number: null });
  const rows = buildUserReports([{ user_id: '123', name: '=formula', mobile: null, register_date: '2026-08-01T00:00Z' }, { user_id: '456', mobile: null, register_date: null }], [
    txn('deposit', 100, 'Approved', '2026-09-01T00:00Z'),
    txn('deposit', 200, 'Approved', '2026-09-14T12:00Z'),
    txn('deposit', 900, 'Rejected', '2026-09-14T12:00Z'),
    txn('withdrawal', 50, 'Approved', '2026-09-14T13:00Z'),
    txn('deposit', 500, null, '2026-09-14T12:00Z'),
    txn('deposit', 700, 'Approved', '2026-09-15T00:00Z'),
  ], range);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].deposits, 200);
  assert.equal(rows[0].netDeposits, 150);
  assert.equal(rows[0].firstDeposit.amount, 100);
  assert.equal(rows[0].unresolvedCount, 1);
  assert.equal(rows[0].bettingPnl, null);
  assert.ok(reportCsv(rows, range).includes("'=formula"));
});
