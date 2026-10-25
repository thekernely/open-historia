/*! Open Historia - read-only dashboard presentation for canonical national metrics. */
import { NATIONAL_NATIVE_METRICS } from './statIndexDefinitions.js';
import { resolveNationalStatReading } from './statsMetricBindings.js';
const LABELS = Object.freeze({gdp:'GDP',gdpPerCapita:'GDP per capita',totalPopulation:'Population',
  gdpGrowth:'GDP growth',inflation:'Inflation',unemployment:'Unemployment',publicDebt:'Public debt',
  sovereignty:'Sovereignty',foodAutonomy:'Food autonomy',energyAutonomy:'Energy autonomy',
  economicIndependence:'Economic independence',internalSecurity:'Internal security',
  internationalReputation:'International reputation',
  budgetBalance:'Budget balance',nationalStability:'National stability'});
const HISTORY_KEYS = Object.freeze({totalPopulation:'population',nationalStability:'stability'});
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
export const dashboardMetricFor = (source, definition, sheet) => {
  if (source.startsWith('native:')) {
    const metric = source.slice(7), native = NATIONAL_NATIVE_METRICS[metric];
    if (!native) return null;
    const reading = resolveNationalStatReading({key:`dashboard${metric}`,nativeMetric:metric,kind:native.kind},sheet);
    return {source,key:metric,label:LABELS[metric]||metric,kind:native.kind,
      color:({gdp:'#34d399',nationalStability:'#22c55e',economicIndependence:'#06b6d4',foodAutonomy:'#22c55e',energyAutonomy:'#eab308'}[metric]||'#b8d0ee'),prefix:native.kind==='currency'?'€':'',
      suffix:native.kind==='percentage'?'%':'', minimum:native.minimum, maximum:native.maximum, reading};
  }
  if (!source.startsWith('custom:')) return null;
  const key = source.slice(7);
  const stat = definition?.sections?.flatMap(s=>s.stats||[]).find(row=>row.key===key&&!row.nativeMetric);
  return stat?{...stat,source,reading:resolveNationalStatReading(stat,sheet)}:null;
};
export const dashboardMetricHistory = (metric, samples) => {
  if (!metric || !Array.isArray(samples)) return [];
  const key = metric.source.startsWith('native:')?(HISTORY_KEYS[metric.key]||metric.key):null;
  return samples.map(sample=>({date:sample.date,
    value:key?sample[key]:sample.customStats?.[metric.key]})).filter(row=>finite(row.value));
};

// This is a comparison of actual recorded readings, never an invented
// pre-start baseline or attribution of causal GDP growth.
export const dashboardRecordedChange = (metric, samples) => {
  const points = dashboardMetricHistory(metric, samples);
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  if (first.date === last.date) return null;
  return { from: first.date, to: last.date, delta: last.value - first.value };
};
