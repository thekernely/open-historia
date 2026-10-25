/*! Open Historia — player Statistics starting-baseline lifecycle source wiring regression. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('./stats.jsx',import.meta.url),'utf8');

test('Country Economy reads canonical world sheet and checks authoring provenance before any generation',()=>{
 assert.match(source,/world\?\.countryStats\?\.\[code\]/);
 assert.match(source,/persistedIsValid && !persistedNeedsNativeAudit/);
 assert.match(source,/needsStartPopulationCalibrationAudit\(persisted, player\)/);
 assert.match(source,/needsLegacyComponentCapAudit\(persisted\)/);
 assert.match(source,/\bfrom "\.\.\/\.\.\/runtime\/statsStartingBaselineAuthority\.js"/);
 const persisted=source.indexOf('const persisted = world?.countryStats?.[code]');
 const generated=source.indexOf('const generated = await generateCountryStatSheet');
 assert.ok(persisted>=0 && generated>persisted,'authoritative state is inspected before provider call');
});

test('pending and cached sheets respect the same starting-baseline gate and hard refresh remains explicit',()=>{
 assert.match(source,/needsStartPopulationCalibrationAudit\(cached\.sheet, player\)/);
 assert.match(source,/needsStartPopulationCalibrationAudit\(pending, player\)/);
 assert.match(source,/const loadSheet = useCallback\(async \(\{ force = false, forceReassess = false/);
});
