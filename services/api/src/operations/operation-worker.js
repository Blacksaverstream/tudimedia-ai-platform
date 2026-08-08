export class OperationWorker {
  constructor({ store, translationProvider, renderProvider, workerId, clock=()=>new Date() }) { this.store=store;this.translationProvider=translationProvider;this.renderProvider=renderProvider;this.workerId=workerId;this.clock=clock; }
  async processNext() { const job=await this.store.claimJob({workerId:this.workerId,now:this.clock()});if(!job)return false;try{const provider=job.jobType==="translation"?this.translationProvider:this.renderProvider;const output=await provider.execute(job);await this.store.completeJob({id:job.id,output,now:this.clock()});return true;}catch(error){await this.store.failJob({id:job.id,error:String(error.message??error).slice(0,2000),now:this.clock()});return true;} }
}
export class HttpOperationProvider {
  constructor({ endpoint, apiKey, kind }) { this.endpoint=endpoint;this.apiKey=apiKey;this.kind=kind; }
  async execute(job) { const response=await fetch(`${this.endpoint}/v1/${this.kind}`,{method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json","idempotency-key":job.id},body:JSON.stringify({jobId:job.id,assetId:job.assetId,...job.input})});if(!response.ok)throw new Error(`${this.kind} provider returned ${response.status}`);const output=await response.json();if(!output||typeof output!=="object")throw new Error(`${this.kind} provider response is invalid`);return output; }
}
