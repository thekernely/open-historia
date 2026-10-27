/*! OpenHistoria: explicit provider-backed diagnostic probe, NOT the gameplay AI router.
 * Reads canonical context; all economic admissions use existing native readers.
 */
import { addGameDays, isCanonicalGameDate } from "../src/runtime/gameDates.js";
import { buildUnquantifiedEconomicAssessmentContext } from "../src/runtime/statsUnquantifiedAssessmentContext.js";
import { validateGeneratedStatsEconomicAccounting } from "../src/runtime/statsEconomicEventAccounting.js";
import { normalizeGameplayPayload, validateGameplayPayload } from "../src/Game/AI/gameplaySchemas.js";
import { decodeWorldStorylineUpdates } from "../src/Game/AI/nativeWorldDirector.js";
import { protectedJumpEconomicPaths, salvageBySchema } from "../src/Game/AI/schemaSalvage.js";
import { runNativePlaytest, digest } from "./native-playtest-core.mjs";
import { allocateCanonicalTurnEventIds } from "../src/runtime/eventIdentity.js";

const object = (v) => Boolean(v && typeof v === "object" && !Array.isArray(v));
const crop = (s,n=100) => typeof s === "string" ? s.slice(0,n) : "";
const configuredCountries = (world) => Object.keys(world?.countryStats||{}).sort();
export const prepareGeminiStatsProbe = ({ game, world, historicalEvents, days=7,
  focusEventId="", focusCountry="" }={}) => {
  if (!object(game)||!object(world)||!Array.isArray(historicalEvents)||days!==7
    ||!isCanonicalGameDate(game.gameDate)||!configuredCountries(world).length) {
    throw new Error("Probe requires canonical game, world, event history and exactly seven in-game days");
  }
  const from=game.gameDate;
  const to=addGameDays(from,days);
  const names=configuredCountries(world);
  const active=(Array.isArray(world.storylines)?world.storylines:[])
    .filter(s=>s?.status==="active")
    .slice(0,10).map(s=>({
      id:crop(s.id,128), startedDate:s.startedDate,
      sourceEventIds:(Array.isArray(s.sourceEventIds)?s.sourceEventIds:[]).slice(-12),
      participants:(Array.isArray(s.participants)?s.participants:[]).slice(0,12),
    }));
  const baselines=names.map(name=>{
    const s=world.countryStats[name]?.economy||{};
    return {country:name,gdpB:Number.isFinite(s.gdp)?Number(s.gdp.toPrecision(8)):null,
      growth:Number.isFinite(s.gdpGrowth)?s.gdpGrowth:null,
      unemployment:Number.isFinite(s.unemployment)?s.unemployment:null};
  });
  const economicReview=buildUnquantifiedEconomicAssessmentContext(world,historicalEvents,from);
  let focus=null;
  if(focusEventId||focusCountry) {
    const event=historicalEvents.find(e=>e?.id===focusEventId);
    if(!event || !names.includes(focusCountry) || event.economicAccounting?.status!=="unquantified")
      throw new Error("Focused assessment requires exact existing unquantified event and national Stats polity");
    const storyline=(world.storylines||[]).find(s=>
      s.status==="active" && (event.storylineIds||[]).includes(s.id)
      && (s.sourceEventIds||[]).includes(event.id)
      && (s.participants||[]).includes(focusCountry));
    if(!storyline)throw new Error("Focused original event lacks an active, source-linked storyline with this national participant");
    focus={originalEventId:event.id,country:focusCountry,sourceStorylineId:storyline.id,
      sourceStartedDate:storyline.startedDate,sourceKind:storyline.kind||"",
      sourceTitle:storyline.title||"",sourceState:crop(storyline.state,1100),
      originalDate:event.date,title:event.title,description:event.description,
      economicAccounting:event.economicAccounting};
  }
  const systemPrompt=`You are testing the actual OpenHistoria geopolitical simulation's economic evidence contract.
Generate a historical one-week time skip in an alternate-history world.
Do not use outside history as a replacement for these campaign facts.
Return ONLY one valid JSON object matching the OpenHistoria jumpForward schema (example below).
Three to five distinct realistic events, dated strictly after ${from} and on/before ${to}.
REQUIRED top fields: stopDate, summary, events; use clearActions:false.
Each event: id (unique), date, title, description, importance, tags, economicAccounting for every Economy-tagged event, impacts:{} unless a verified national change.
Do NOT include event.storylineIds in generated JSON: it is not a schema field. To link an event to an existing active storyline, return one canonical storylineUpdates line at the TOP LEVEL:
id~active~pressure(0..100)~momentum(0..100)~originalStartedDate~kind~title~participantsCSV~eventNumbersCSV~state
Here eventNumbersCSV uses 1-based indices into the returned events. Leave storylineUpdates empty when no actual update/evidence supports linking. Don't invent a source ID.
A statsEffects.sourceStorylineId only works when an actual storylineUpdates line links the corresponding event index to that SAME active source; otherwise do not generate the estimated effect.
Historical unsettled crisis DOES NOT prove national GDP declined. Do not infer affected countries merely from storyline participation.
An economy-related event must declare economicAccounting:{status:"none"|"unquantified"|"applied",reason:string} and optional documented exposures.
"none" for rhetoric or proposals; "unquantified" for actual consequences lacking defensible numbers.
"applied" ONLY when you include a valid impacts.polityChanges[].statsEffects with country-specific concrete causal evidence.
If genuinely evidenced: a new date-bound economicShockEstimate is a SIMULATION ESTIMATE, never an observed GDP loss; annualRealGrowthDelta must be negative in [-20,0), durationDays 1..90, gdpCause:"trade" or suitable canonical cause, sourceStorylineId must be the exact ACTIVE referenced storyline, assessesUnquantifiedEventId the exact earlier original ID, and the target polity must actually be involved and affected. Include economicShockEstimate {basis:"simulation-estimate",channel:"credit"|"trade"|"production"|"logistics"|"labor",exposure:"direct"|"dependent",evidence:"32-240 chars of concrete canonical country-specific disruption"} and statsEffects.reason.
Do not insert a numerical effect merely to satisfy this test; report unresolved national uncertainty instead.
No new territory, ownership, unit, project, debt or geopolitical changes in this diagnostic unless evidence supports them. Do not fabricate identified wars.
Example of schema-valid minimal output (not a desired answer):
{"stopDate":"${to}","summary":"A week of monitoring and negotiations.","clearActions":false,"events":[{"id":"week-watch-1","date":"${to}","title":"Officials review trade reports","description":"Officials confer but no binding policy changes are enacted.","importance":"minor","tags":["Economy"],"economicAccounting":{"status":"none","reason":"No enacted material economic consequences."},"impacts":{}}]}
Your outcome will be independently validated against OpenHistoria's real jumpForward schema AND its native typed Statistics writer.
${focus ? `Diagnostic focus: prioritize a NEW dated follow-up to original event ${focus.originalEventId} for ${focus.country} under active storyline ${focus.sourceStorylineId}. If its documented credit/trade disruption continues, a bounded negative simulation estimate may be justified; never present it as measured GDP. Link that follow-up as event 1 using storylineUpdates, or explain insufficient evidence through unquantified economicAccounting. Do not invent numeric results simply to pass a test.` : ""}`;
  const userPrompt=JSON.stringify({
    gameDate:from,requestedStopDate:to,playerCountry:game.country,
    canonicalCountries:baselines,activeStorylines:active,
    unresolvedEconomicEvidence:economicReview,
    ...(focus?{focusedHistoricalEvidence:focus}:{}),
    recentAcceptedEvents:historicalEvents.slice(-9).map(e=>({
      id:e.id,date:e.date,title:e.title,description:crop(e.description,300),
      storylineIds:e.storylineIds||[],economicAccounting:e.economicAccounting||null,
    })),
  });
  return { fromDate:from,toDate:to,systemPrompt,userPrompt,
    contextDigest:digest({from,to,active,baselines,economicReview,focus}),
    unresolvedReviewIncluded:Boolean(economicReview)};
};

export const evaluateGeminiStatsProbe = ({game,world, historicalEvents, colors={},responseText,toDate}={})=>{
  let parsed;
  try {parsed=JSON.parse(responseText);}catch(e){
    return {status:"invalid-json",error:String(e.message).slice(0,300),nativeReplay:false};
  }
  const payload=normalizeGameplayPayload("jumpForward",parsed);
  const verdict=validateGameplayPayload("jumpForward",payload);
  let salvaged=[];
  if(!verdict.valid) {
    // Mirror the actual skip's salvage contract: harmless optional field
    // removal is allowed, but an entire event must NEVER disappear while
    // its summary/history still claims it happened.
    const result=salvageBySchema(payload,
      candidate=>validateGameplayPayload("jumpForward",candidate),
      {protectedArrayItems:["$.events"],
        protectedPathPrefixes:protectedJumpEconomicPaths(payload)});
    salvaged=result.removed.map(row=>({kind:row.kind,path:row.path}));
    if(!result.valid) return {status:"invalid-schema",error:result.error,
      originalError:verdict.error,nativeReplay:false,salvaged,payload};
  }
  if(payload.stopDate!==toDate) return {status:"wrong-stop-date",nativeReplay:false,payload};
  const economicError=validateGeneratedStatsEconomicAccounting(payload.events);
  if(economicError) return {status:"invalid-economic-accounting",error:economicError,nativeReplay:false,payload};
  // In the real game, decoded storylineUpdates eventIndexes attach canonical
  // storylineIds AFTER schema validation. Reuse its native decoder and apply
  // only existing ACTIVE source IDs here. This standalone diagnostic deliberately
  // does not invent or create source records or run all world directors.
  const decoded=decodeWorldStorylineUpdates(payload.storylineUpdates||"");
  const existing=new Set((world.storylines||[]).filter(s=>s.status==="active").map(s=>s.id));
  const attached=payload.events.map((e,index)=>({
    ...e,
    storylineIds:[...new Set(decoded.filter(s=>existing.has(s.id) &&
      s.eventIndexes.includes(index)).map(s=>s.id))],
  }));
  // Gameplay allocates canonical event IDs after provider schema validation.
  // Mirror that exact seam before invoking the stricter native replay runner.
  const identified=allocateCanonicalTurnEventIds({
    existingEvents:historicalEvents,newEvents:attached,round:(game.round||0)+1,
  }).events;
  try {
    const {report,snapshot}=runNativePlaytest({
      game,world,historicalEvents,colors,
      turn:{toDate,events:identified},
    });
    const newReceipts=report.newStatsReceipts||[];
    const negativeNational=newReceipts.filter(r=>
      typeof r?.process?.annualRealGrowthDelta==="number" && r.process.annualRealGrowthDelta<0);
    const reviewed=newReceipts.filter(r=>r.assessesUnquantifiedEventId);
    const documented=(payload.events||[]).reduce((n,e)=>n+(e.economicAccounting?.exposures?.length||0),0);
    return {
      status:"native-settled",nativeReplay:true,salvaged,
      eventCount:payload.events.length,receiptCount:newReceipts.length,
      acceptedNegativeInfluenceCount:negativeNational.length,
      acceptedPriorCrisisAssessments:reviewed.length,
      providerDocumentedExposureCount:documented,
      allCountriesGdpIncreased:report.observations.everyCountryGdpIncreased,
      coverage:report.coverage,
      statisticsReport:report,
      payload,
      snapshot,
    };
  } catch(e) {
    return {status:"native-rejected",error:String(e.message).slice(0,700),
      nativeReplay:false,salvaged,payload};
  }
};
