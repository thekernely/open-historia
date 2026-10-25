import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardMetricFor,dashboardMetricHistory,dashboardRecordedChange} from './statsDashboardReadings.js';
const sheet={economy:{gdp:297500000000,publicDebt:62.9},population:{total:78300000},customStats:{grain:45}};
const definition={custom:true,sections:[{key:'resources',stats:[{key:'grain',label:'Grain supply',kind:'index'}]}]};
test('two native cards share one canonical reading with no customStats writer',()=>{
 const first=dashboardMetricFor('native:gdp',definition,sheet),second=dashboardMetricFor('native:gdp',definition,sheet);
 assert.equal(first.reading.value,297500000000);assert.equal(second.reading.value,first.reading.value);
 assert.equal(first.reading.source,'native');assert.equal(sheet.customStats.gdp,undefined);
});
test('custom national reading is independent, and native collision is not masked',()=>{
 assert.equal(dashboardMetricFor('custom:grain',definition,sheet).reading.value,45);
 const conflict={...sheet,customStats:{...sheet.customStats,gdp:300000000000}};
 assert.deepEqual(dashboardMetricFor('native:gdp',definition,conflict).reading.status,'review-required');
 assert.equal(dashboardMetricFor('custom:missing',definition,sheet),null);
});
test('sparkline uses actual dated measurements, never makes up missing points',()=>{
 const metric=dashboardMetricFor('native:gdp',definition,sheet);
 assert.deepEqual(dashboardMetricHistory(metric,[]),[]);
 assert.deepEqual(dashboardMetricHistory(metric,[{date:'1912-01-01',gdp:141e9},{date:'1913-06-07',gdp:169e9}]),[
  {date:'1912-01-01',value:141e9},{date:'1913-06-07',value:169e9}]);
});

test('change summary uses only two distinct dated observations and never fabricates a start',()=>{
 const metric=dashboardMetricFor('native:gdp',definition,sheet);
 assert.equal(dashboardRecordedChange(metric,[]),null);
 assert.equal(dashboardRecordedChange(metric,[{date:'1912-01-01',gdp:141e9}]),null);
 assert.deepEqual(dashboardRecordedChange(metric,[{date:'1912-01-01',gdp:141e9},{date:'1913-06-07',gdp:169e9}]),
  {from:'1912-01-01',to:'1913-06-07',delta:28e9});
});
