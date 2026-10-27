import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareGeminiStatsProbe, evaluateGeminiStatsProbe } from "../../scripts/gemini-stats-probe-core.mjs";
import { runCli } from "../../scripts/gemini-stats-probe.mjs";
import { mergeCountryStatPatch } from "./countryStats.js";

const country=(name)=>mergeCountryStatPatch(null,{
  territorialComponents:[{geography:name+" centre",group:"core",population:1000000,gdpPerCapita:1000}],
  economy:{gdpGrowth:4,unemployment:6,inflation:2,publicDebt:35,budgetBalance:-2},
  continuity:{assessedDate:"1912-01-01"},
});
const fixture=()=>({
  game:{country:"Aland",gameDate:"1912-02-01",round:2},
  world:{ownerCodes:["Aland","Neutral"],
    polityOverrides:{Aland:{code:"Aland",name:"Aland"},Neutral:{code:"Neutral",name:"Neutral"}},
    countryStats:{Aland:country("Aland"),Neutral:country("Neutral")},
    storylines:[{
      id:"credit-crisis",status:"active",startedDate:"1912-01-01",
      kind:"crisis",title:"Bank Settlement Freeze",pressure:70,momentum:50,
      sourceEventIds:["origin-credit"],participants:["Aland"],
      state:"Aland merchant clearing banks cannot settle legacy credit instruments.",
    }],
  },
  historicalEvents:[{
    id:"origin-credit",date:"1912-01-03",
    title:"Aland Banks Freeze Merchant Lending",
    description:"Aland merchant banks impose emergency credit restrictions following the collapse of wholesale settlement markets.",
    importance:"major",tags:["Economy"],storylineIds:["credit-crisis"],
    economicAccounting:{status:"unquantified",
      reason:"National trade credit is frozen but no GDP loss estimate was previously accepted."},
    impacts:{},
  }],
  colors:{},
});
const answer=(withHistoricalId=true)=>({
  stopDate:"1912-02-08",summary:"Aland clearing banks adopt an emergency plan for credit contraction.",
  clearActions:false,
  storylineUpdates:"credit-crisis~active~70~50~1912-01-01~crisis~Bank Settlement Freeze~Aland~1~Settlement restrictions are still disrupting Aland imports.",
  events:[{
    id:"new-credit-impact",date:"1912-02-04",
    title:"Aland Clearing Houses Restrict Import Financing",
    description:"Aland central clearing houses ration domestic financing for confirmed export orders because the merchant credit freeze remains in effect.",
    importance:"major",tags:["Economy"],
    economicAccounting:{status:"applied",reason:"A bounded national simulation estimate now captures the active Aland credit freeze."},
    impacts:{polityChanges:[{operation:"update",code:"Aland",
      statsEffects:{annualRealGrowthDelta:-1.5,durationDays:30,gdpCause:"trade",
        sourceStorylineId:"credit-crisis",
        ...(withHistoricalId?{assessesUnquantifiedEventId:"origin-credit"}:{}),
        economicShockEstimate:{basis:"simulation-estimate",channel:"credit",exposure:"direct",
          evidence:"Aland merchants have confirmed order financing frozen through national clearing banks during the ongoing credit collapse."},
        reason:"Confirmed import financing restrictions require a bounded thirty-day national growth-rate estimate.",
      },
    }]},
  }],
});
test("focused briefing demands actual canonical country, original event and active source ID",()=>{
  const f=fixture();
  const focused=prepareGeminiStatsProbe({...f,focusEventId:"origin-credit",focusCountry:"Aland"});
  assert.match(focused.userPrompt,/"originalEventId":"origin-credit"/);
  assert.match(focused.systemPrompt,/FOCUSED CAUSAL REVIEW|Diagnostic focus/);
  assert.equal(focused.toDate,"1912-02-08");
  assert.throws(()=>prepareGeminiStatsProbe({...f,focusEventId:"origin-credit",focusCountry:"Neutral"}),/source-linked storyline/);
  assert.throws(()=>prepareGeminiStatsProbe({...f,focusEventId:"wrong",focusCountry:"Aland"}),/existing unquantified/);
});
test("canonical storyline ledger binds the provider event, and native settlement closes exactly one historical assessment",()=>{
  const f=fixture();
  const outcome=evaluateGeminiStatsProbe({...f,responseText:JSON.stringify(answer()),toDate:"1912-02-08"});
  assert.equal(outcome.status,"native-settled",outcome.error);
  assert.equal(outcome.acceptedNegativeInfluenceCount,1);
  assert.equal(outcome.acceptedPriorCrisisAssessments,1);
  assert.equal(outcome.statisticsReport.newStatsReceiptCount,1);
  assert.equal(outcome.statisticsReport.newStatsReceipts[0].polity,"Aland");
  assert.equal(outcome.statisticsReport.newStatsReceipts[0].assessesUnquantifiedEventId,"origin-credit");
  assert.equal(outcome.statisticsReport.countryChanges.find(r=>r.country==="Neutral").gdpAfter,
    evaluateGeminiStatsProbe({...f,responseText:JSON.stringify({
      stopDate:"1912-02-08",summary:"No material change.",
      events:[{id:"quiet",date:"1912-02-04",title:"Quiet week",description:"No enacted changes.",
        impacts:{}}],
    }),toDate:"1912-02-08"}).statisticsReport.countryChanges.find(r=>r.country==="Neutral").gdpAfter);
});
test("provider-omitted event IDs are assigned by the game's real canonical turn allocator",()=>{
  const f=fixture();
  const returned=answer();
  delete returned.events[0].id;
  const out=evaluateGeminiStatsProbe({...f,responseText:JSON.stringify(returned),toDate:"1912-02-08"});
  assert.equal(out.status,"native-settled",out.error);
  assert.equal(out.acceptedPriorCrisisAssessments,1);
  assert.match(out.statisticsReport.newStatsReceipts[0].eventId,
    /^event-ai-r0003-19120204-001$/);
});

test("national shock without original ID is a real influence, not a fictional historical closure",()=>{
  const f=fixture();
  const out=evaluateGeminiStatsProbe({...f,responseText:JSON.stringify(answer(false)),toDate:"1912-02-08"});
  assert.equal(out.status,"native-settled");
  assert.equal(out.acceptedNegativeInfluenceCount,1);
  assert.equal(out.acceptedPriorCrisisAssessments,0);
});
test("salvage discards harmless invalid tags but cannot discard a whole event or malformed required economy accounting",()=>{
  const f=fixture();
  const value=answer();
  value.events[0].tags.push("NotACanonicalTag");
  const out=evaluateGeminiStatsProbe({...f,responseText:JSON.stringify(value),toDate:"1912-02-08"});
  assert.equal(out.status,"native-settled",out.error);
  assert.ok(out.salvaged.some(s=>s.path.includes("tags[1]")));
  value.events[0].economicAccounting={status:"applied",reason:"bad"};
  const bad=evaluateGeminiStatsProbe({...f,responseText:JSON.stringify(value),toDate:"1912-02-08"});
  assert.equal(bad.status,"invalid-schema");
});
test("one archived Gemini correction receives all native validation faults and replays a verified estimate",async()=>{
  const f=fixture();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"oh-gemini-corrective-"));
  try {
    const dir=path.join(root,"campaign");
    fs.mkdirSync(path.join(dir,"storage"),{recursive:true});
    fs.writeFileSync(path.join(dir,"game.json"),JSON.stringify(f.game));
    fs.writeFileSync(path.join(dir,"world.json"),JSON.stringify(f.world));
    fs.writeFileSync(path.join(dir,"storage","events.json"),JSON.stringify(f.historicalEvents));
    const invalid=answer();
    delete invalid.events[0].id;
    delete invalid.events[0].impacts.polityChanges[0].statsEffects.economicShockEstimate;
    invalid.events[0].economicAccounting.reason="Credit contraction and documented national settlement disruption. ".repeat(5);
    invalid.events[0].economicAccounting.exposures=[
      {polity:"Aland",channel:"credit",exposure:"direct",
        evidence:"The national banking system cannot clear trade settlement orders."},
      {polity:"Aland",channel:"trade",exposure:"direct",
        evidence:"The blocked banking system disrupted national import financing."},
    ];
    const archive=path.join(root,"provider.json");
    fs.writeFileSync(archive,JSON.stringify({
      ok:true,status:200,response:{candidates:[{content:{parts:[{
        functionCall:{name:"submit_jump_result",args:invalid},
      }]}}]},
    }));
    const key=path.join(root,"ephemeral");
    fs.writeFileSync(key,"mock-credential");
    const output=path.join(root,"corrected");
    let calls=0;
    const fetchImpl=async(_url,options)=>{
      calls++;
      assert.equal(fs.existsSync(key),false,"ephemeral credential unlinked before network call");
      const req=JSON.parse(options.body);
      const text=req.contents.at(-1).parts[0].text;
      assert.match(text,/duplicate polity: aland/);
      assert.match(text,/reason must be at most 240 characters/);
      assert.match(text,/statsEffects\.economicShockEstimate is required/);
      assert.match(req.contents[1].parts[0].text,/credit-crisis/);
      assert.equal(options.headers["x-goog-api-key"],"mock-credential");
      const corrected=answer();
      delete corrected.events[0].id;
      return {ok:true,status:200,text:async()=>JSON.stringify({
        candidates:[{finishReason:"STOP",content:{parts:[{
          functionCall:{name:"submit_jump_result",args:corrected},
        }]}}],
        usageMetadata:{promptTokenCount:500,candidatesTokenCount:250},
      })};
    };
    const outcome=await runCli(["--game-dir",dir,"--out",output,
      "--key-file",key,"--repair-archive",archive],{fetchImpl});
    assert.equal(calls,1,"exactly one explicit corrective request");
    assert.equal(outcome.status,"native-settled",outcome.summary?.error);
    assert.equal(outcome.summary.acceptedPriorCrisisAssessments,1);
    assert.equal(outcome.summary.acceptedNegativeInfluenceCount,1);
    assert.equal(outcome.provider.correctedFromArchive,true);
    assert.equal(fs.existsSync(key),false);
    for(const item of fs.readdirSync(output)) {
      assert.ok(!fs.readFileSync(path.join(output,item),"utf8").includes("mock-credential"));
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test("CLI sends one native Gemini function declaration, strips credential, and keeps outputs separate",async()=>{
  const f=fixture();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"oh-gemini-stats-"));
  try {
    const source=path.join(root,"saved");fs.mkdirSync(path.join(source,"storage"),{recursive:true});
    fs.writeFileSync(path.join(source,"game.json"),JSON.stringify(f.game));
    fs.writeFileSync(path.join(source,"world.json"),JSON.stringify(f.world));
    fs.writeFileSync(path.join(source,"storage","events.json"),JSON.stringify(f.historicalEvents));
    const key=path.join(root,"secret.txt"),out=path.join(root,"report");
    fs.writeFileSync(key,"temporary-test-credential");
    let requests=0;
    const fetchImpl=async(url,options)=>{
      requests++;
      assert.match(url,/gemini-3.5-flash-lite:generateContent$/);
      assert.equal(options.headers["x-goog-api-key"],"temporary-test-credential");
      assert.equal(fs.existsSync(key),false,"key must be deleted before remote call");
      const request=JSON.parse(options.body);
      assert.equal(request.tools[0].functionDeclarations[0].name,"submit_jump_result");
      assert.equal(request.toolConfig.functionCallingConfig.mode,"ANY");
      assert.ok(!JSON.stringify(request).includes("temporary-test-credential"));
      return {ok:true,status:200,text:async()=>JSON.stringify({
        candidates:[{finishReason:"STOP",content:{parts:[{
          functionCall:{name:"submit_jump_result",args:answer()},
        }]}}],
        usageMetadata:{promptTokenCount:120, candidatesTokenCount:50},
      })};
    };
    const result=await runCli(["--game-dir",source,"--out",out,
      "--key-file",key,"--focus-event","origin-credit","--focus-country","Aland"],
      {fetchImpl});
    assert.equal(requests,1);
    assert.equal(result.status,"native-settled",result.summary?.error);
    assert.equal(result.summary.acceptedPriorCrisisAssessments,1);
    assert.equal(fs.existsSync(key),false);
    const files=fs.readdirSync(out);
    assert.ok(files.includes("native-statistics-report.json"));
    assert.ok(files.includes("provider.json"));
    for(const file of files)assert.ok(!fs.readFileSync(path.join(out,file),"utf8")
      .includes("temporary-test-credential"));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
