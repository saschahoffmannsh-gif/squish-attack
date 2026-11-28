// Start the fusion mesher as a module worker. Under capacitor:// (WKWebView)
// `new Worker(mjsURL, {type:"module"})` often fails silently (MIME / custom
// scheme), so we fetch the two modules and run them as one blob with a
// JavaScript MIME type. Web https keeps the direct URL worker.
export const FUSION_WORKER_QUERY='fuse-4';

export function bundleFusionWorkerSource(coreSrc, workerSrc) {
  const stripped=String(workerSrc).replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*/m,'');
  if(stripped===String(workerSrc))throw new Error('fusion-worker import not found');
  return `${coreSrc}\n${stripped}`;
}

async function read(url, fetchImpl) {
  const r=await fetchImpl(url);
  if(!r?.ok)throw new Error(`fusion worker fetch ${url} ${r?.status||''}`);
  return r.text();
}

export async function spawnFusionWorker({
  base=import.meta.url,
  WorkerCtor=globalThis.Worker,
  fetchImpl=globalThis.fetch.bind(globalThis),
  blob=false,
}={}) {
  const workerUrl=new URL(`./fusion-worker.mjs?v=${FUSION_WORKER_QUERY}`,base);
  if(!blob)return new WorkerCtor(workerUrl,{type:'module'});
  const coreUrl=new URL(`./fusion-core.mjs?v=${FUSION_WORKER_QUERY}`,base);
  const [workerSrc,coreSrc]=await Promise.all([read(workerUrl,fetchImpl),read(coreUrl,fetchImpl)]);
  const url=URL.createObjectURL(new Blob([bundleFusionWorkerSource(coreSrc,workerSrc)],{type:'application/javascript'}));
  return new WorkerCtor(url,{type:'module'});
}
