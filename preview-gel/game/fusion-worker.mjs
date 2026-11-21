import {createHost} from './fusion-core.mjs?v=fuse-3';
const handle=createHost((msg,transfer)=>self.postMessage(msg,transfer||[]));
self.onmessage=e=>handle(e.data);
