import {CheckCircle2, LoaderCircle, AlertCircle} from 'lucide-react'
export default function SaveFeedback({busy=false,success='',error=''}:{busy?:boolean;success?:string;error?:string}) {
 return <div className="save-feedback" aria-atomic="true">
  {busy?<div className="saving" role="status"><LoaderCircle className="spin" size={20}/> A guardar… Aguarda a confirmação.</div>:<>
   {success&&<div className="saved" role="status"><CheckCircle2 size={20}/>{success}</div>}
   {error&&<div className="failed" role="alert"><AlertCircle size={20}/>{error}</div>}
  </>}
 </div>
}
