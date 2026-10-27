#!/usr/bin/env node
/*! One-request OpenHistoria Gemini economic-causality diagnostic.
 * Not a substitute for the actual full gameplay prompt or UI provider router.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareGeminiStatsProbe, evaluateGeminiStatsProbe } from "./gemini-stats-probe-core.mjs";
import { digest } from "./native-playtest-core.mjs";
import { getGameplayTool } from "../src/Game/AI/gameplaySchemas.js";
import { toGeminiSchema } from "../src/Game/AI/geminiSchema.js";

const providerAnswer=(response,toolName)=> {
  const parts=response?.candidates?.[0]?.content?.parts||[];
  const call=parts.find(part=>part.functionCall?.name===toolName)?.functionCall;
  return call?.args ? JSON.stringify(call.args)
    : parts.map(part=>typeof part.text==="string"?part.text:"").join("");
};
const takeArgs=(argv)=>{
  const out={}; const valid=new Set(["--game-dir","--out","--key-file","--response-file","--model","--dry-run","--focus-event","--focus-country","--transport","--repair-archive"]);
  for(let i=0;i<argv.length;i++) {
    const key=argv[i];
    if(!valid.has(key)||Object.hasOwn(out,key))throw Error("Unknown/duplicate option: "+key);
    if(key==="--dry-run"){out[key]=true;continue;}
    if(!argv[i+1]||argv[i+1].startsWith("--"))throw Error("Missing value for "+key);
    out[key]=argv[++i];
  }
  const modes=Number(Boolean(out["--dry-run"]))+Number(Boolean(out["--key-file"]))
    +Number(Boolean(out["--response-file"]));
  if(!out["--game-dir"]||!out["--out"]||modes!==1
    ||(out["--repair-archive"]&&!out["--key-file"]))
    throw Error("Required --game-dir --out and exactly one of --dry-run, --key-file or --response-file. --repair-archive requires --key-file.");
  return out;
};
const read=(p)=>JSON.parse(fs.readFileSync(p,"utf8"));
const write=(dir,name,obj)=>fs.writeFileSync(path.join(dir,name),
  JSON.stringify(obj,null,2)+"\n",{flag:"wx"});
export const runCli=async (argv,{ fetchImpl=fetch }={})=>{
  const args=takeArgs(argv);const gameDir=path.resolve(args["--game-dir"]);
  const out=path.resolve(args["--out"]);
  const model=args["--model"]||"gemini-3.5-flash-lite";
  const transport=args["--transport"]||"tool";
  if(!["tool","json"].includes(transport))throw Error("Transport must be tool or json");
  if(!/^gemini-[\w.-]+$/.test(model))throw Error("Invalid Gemini model selector");
  const keyFile=args["--key-file"]?path.resolve(args["--key-file"]):"";
  if(out===gameDir||out.startsWith(gameDir+path.sep)
    ||(keyFile&&(out===keyFile||out.startsWith(keyFile+path.sep)))
    ||(keyFile&&(keyFile===gameDir||keyFile.startsWith(gameDir+path.sep))))
    throw Error("Output and temporary key must be outside the source game");
  if(fs.existsSync(out))throw Error("Report path already exists; no overwrite");
  const game=read(path.join(gameDir,"game.json"));
  const world=read(path.join(gameDir,"world.json"));
  const historicalEvents=read(path.join(gameDir,"storage","events.json"));
  const cp=path.join(gameDir,"colors.json");
  const colors=fs.existsSync(cp)?read(cp):{};
  const prep=prepareGeminiStatsProbe({game,world,historicalEvents,
    focusEventId:args["--focus-event"]||"",focusCountry:args["--focus-country"]||""});
  const inputsHash=digest({game,world,historicalEvents,colors});
  const request={model,transport,systemPrompt:prep.systemPrompt,userPrompt:prep.userPrompt,
    fromDate:prep.fromDate,toDate:prep.toDate,contextDigest:prep.contextDigest,
    ...(args["--repair-archive"]?{repairArchiveMode:true}: {})};
  if(args["--dry-run"]){
    fs.mkdirSync(out,{recursive:true});write(out,"prompt.json",request);
    write(out,"result.json",{status:"dry-run",providerCalled:false,originalSaveModified:false});
    return {status:"dry-run",path:out};
  }
  const replayFile=args["--response-file"]?path.resolve(args["--response-file"]):"";
  const repairFile=args["--repair-archive"]?path.resolve(args["--repair-archive"]):"";
  for(const sourceFile of [replayFile,repairFile]){
    if(sourceFile&&(out===sourceFile||out.startsWith(sourceFile+path.sep)))
      throw Error("Report path cannot replace archived provider evidence");
  }
  let originalReply="", repairFeedback="";
  if(repairFile){
    const record=read(repairFile);
    if(record.ok===false||record.response?.error)throw Error("Cannot repair an unsuccessful provider response");
    originalReply=providerAnswer(record.response||record,getGameplayTool("jumpForward").name);
    const previous=evaluateGeminiStatsProbe({game,world,historicalEvents,colors,
      responseText:originalReply,toDate:prep.toDate});
    if(previous.status==="native-settled")throw Error("Archived answer already settled; no corrective request needed");
    repairFeedback=previous.originalError||previous.error;
    if(!repairFeedback||!originalReply)throw Error("Archived response cannot be corrected without a concrete validation error");
  }
  let key="";
  if(!replayFile) try {
    // Secret is read once and immediately unlinked; it is NEVER persisted in
    // the request, response, report, output path, subprocess arguments or Git.
    const stat=fs.statSync(keyFile);
    if(!stat.isFile()||stat.size>4096)throw Error("Invalid ephemeral credential file");
    key=fs.readFileSync(keyFile,"utf8").trim();
    if(!key)throw Error("Empty temporary credential");
  } finally {
    if(keyFile&&fs.existsSync(keyFile))fs.unlinkSync(keyFile);
  }
  let parsed, status, ok;
  if(replayFile){
    const archived=read(replayFile);
    parsed=archived.response||archived;
    status=archived.status??200;
    ok=archived.ok??true;
  } else {
    const url="https://generativelanguage.googleapis.com/v1beta/models/"
      +encodeURIComponent(model)+":generateContent";
    const tool=getGameplayTool("jumpForward");
    const body={system_instruction:{parts:[{text:prep.systemPrompt}]},
      contents:[
        {role:"user",parts:[{text:prep.userPrompt}]},
        ...(repairFile ? [
          {role:"model",parts:[{text:originalReply}]},
          {role:"user",parts:[{text:
            `Your previous structured answer failed OpenHistoria validation: ${repairFeedback}. `
            +"Call the same tool again with corrected structured input. Preserve all valid events, dates, titles, canonical source references and meaningful content. "
            +"Repair only the identified invalid fields. If a numerical country-level estimate remains unsupported, use unquantified without a typed effect; never manufacture measured losses."}]},
        ] : []),
      ],
      generationConfig:{...(transport==="json"?{responseMimeType:"application/json"}:{}),
        temperature:0.2,maxOutputTokens:6500},
      ...(transport==="tool"?{
        tools:[{functionDeclarations:[{
          name:tool.name,description:tool.description,
          parameters:toGeminiSchema(tool.schema),
        }]}],
        toolConfig:{functionCallingConfig:{
          mode:"ANY",allowedFunctionNames:[tool.name],
        }},
      }:{})};
    let response;
    try {
      response=await fetchImpl(url,{method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
    } finally {key="";}
    const raw=await response.text();
    status=response.status;ok=response.ok;
    try {parsed=JSON.parse(raw);}catch {parsed={httpBodyParseError:true};}
  }
  const providerMeta={status,ok,transport,replayedFromArchive:Boolean(replayFile),
    correctedFromArchive:Boolean(repairFile),
    model,inputTokens:parsed.usageMetadata?.promptTokenCount??null,
    outputTokens:parsed.usageMetadata?.candidatesTokenCount??null,
    finishReason:parsed.candidates?.[0]?.finishReason||null,
    errorStatus:parsed.error?.status||null};
  const responseText=providerAnswer(parsed,getGameplayTool("jumpForward").name);
  const assessment=ok && responseText ?
    evaluateGeminiStatsProbe({game,world,historicalEvents,colors,responseText,
      toDate:prep.toDate}) : {status:"provider-error",nativeReplay:false};
  if(repairFile&&assessment.payload) {
    try {
      const before=JSON.parse(originalReply);
      if(Array.isArray(before.events)&&Array.isArray(assessment.payload.events)) {
        const oldEvents=before.events.map(e=>[e?.date,e?.title]);
        const corrected=assessment.payload.events.map(e=>[e?.date,e?.title]);
        if(JSON.stringify(oldEvents)!==JSON.stringify(corrected)) {
          assessment.status="repair-continuity-rejected";
          assessment.error="Corrective provider answer rewrote or deleted original dated events";
          assessment.nativeReplay=false;
          delete assessment.snapshot;
          delete assessment.statisticsReport;
        }
      }
    } catch {
      assessment.status="repair-continuity-rejected";
      assessment.error="Archived provider response was not comparable for correction";
      assessment.nativeReplay=false;
      delete assessment.snapshot;
      delete assessment.statisticsReport;
    }
  }
  const afterHash=digest({game,world,historicalEvents,colors});
  if(afterHash!==inputsHash)throw Error("Read-only campaign input changed in memory");
  fs.mkdirSync(out,{recursive:true});
  write(out,"prompt.json",request);
  write(out,"provider.json",{...providerMeta,
    // Raw provider result retained for diagnosis, but no request headers/key.
    response:parsed});
  const {snapshot,payload,statisticsReport,...summary}=assessment;
  write(out,"result.json",{provider:providerMeta,...summary,
    providerCalled:!replayFile,fullGameplayTurn:false,originalSaveModified:false});
  if(payload)write(out,"accepted-or-invalid-payload.json",payload);
  if(statisticsReport)write(out,"native-statistics-report.json",statisticsReport);
  if(snapshot)write(out,"native-diagnostic-snapshot.json",snapshot);
  return {status:summary.status,path:out,provider:providerMeta,summary};
};
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  runCli(process.argv.slice(2)).then(r=>{
    console.log(JSON.stringify({status:r.status,provider:r.provider,
      acceptedEffects:r.summary?.acceptedNegativeInfluenceCount??0,
      priorCrisisAssessments:r.summary?.acceptedPriorCrisisAssessments??0,
      reportDirectory:r.path}));
    if(!["native-settled","dry-run"].includes(r.status))process.exitCode=2;
  }).catch(e=>{console.error("Provider probe failed: "+String(e.message).slice(0,260));process.exitCode=1;});
}
